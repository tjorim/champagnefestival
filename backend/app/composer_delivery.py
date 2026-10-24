"""Delivery for the central composer (#942): outbox handlers for the actual
send — resolving the audience, creating/publishing the announcement channel,
and enqueueing one Web Push job per targeted subscriber.

Two job types, run through the same durable outbox #947 built for email and
reused by #941's admin test-send:

- ``composer_message_dispatch`` (``deliver_composer_message_dispatch``): the
  ``scheduled -> sent`` transition itself. Runs once per composed message,
  at the requested ``scheduled_at`` (or immediately for "send now" — see
  ``app.services.composer_service.schedule_send``). Resolves the audience
  fresh at this point, so subscribers added after scheduling are included.
- ``composer_message_email`` (``deliver_composer_email``): one job per frozen
  recipient (#1407), staggered to ``MEMBER_MAIL_MAX_PER_MINUTE`` and allowed a
  single attempt: a mail whose outcome is unknown is never submitted again.
- ``composer_message_push`` (``deliver_composer_push``): one job per
  targeted subscriber, enqueued by the dispatch handler above. Reuses
  ``app.push``'s SSRF guard, redirect-disabled delivery, and 404/410
  retirement handling exactly — the only difference from #941's admin
  test-send is a composed (not hardcoded) payload and a composite
  ``resource_id`` (``"{message_id}:{subscription_id}"``) so the handler
  knows which message's text to send.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import cast
from urllib.parse import urlparse

from pydantic import ValidationError
from pywebpush import WebPushException
from sqlalchemy import select

from app import member_mail
from app.audit import write_audit_entry
from app.composer_content import build_composer_payload as _build_composer_payload
from app.composer_content import pick_locale_text as _pick_locale_text
from app.config import settings
from app.database import async_session_factory
from app.member_mail import (
    MemberMail,
    MemberMailRejected,
    MemberMailSkipped,
    MemberMailUnavailable,
    MemberMailUncertain,
)
from app.models import ComposedMessage, EmailCategory, OutboxJob, PushSubscription
from app.push import (
    _INVALID_SUBSCRIPTION_STATUSES,
    _resolves_to_public_address,
    _send_sync,
    push_enabled,
)
from app.schemas import AnnouncementCreate, AnnouncementLevel
from app.services import announcements_service
from app.services.member_mail_audience import eligible_people, eligible_person
from app.services.member_mail_render import render_member_mail
from app.services.member_mail_unsubscribe import unsubscribe_page_url, unsubscribe_url
from app.services.outbox_service import enqueue_job

logger = logging.getLogger(__name__)

COMPOSER_MESSAGE_PUSH = "composer_message_push"
COMPOSER_MESSAGE_EMAIL = "composer_message_email"


async def deliver_composer_message_dispatch(resource_id: str) -> bool:
    """Outbox handler for ``composer_message_dispatch`` jobs — resource_id
    is the ``ComposedMessage`` id."""
    async with async_session_factory() as db:
        message = (
            await db.execute(select(ComposedMessage).where(ComposedMessage.id == resource_id).with_for_update())
        ).scalar_one_or_none()
        if message is None:
            return True
        if message.state == "sent":
            # Already dispatched by a prior attempt — convergent, not a retry.
            return True
        if message.state != "scheduled":
            logger.warning("composer dispatch: message_id=%s is in unexpected state=%s.", resource_id, message.state)
            return True

        actor = message.sent_by or "system"

        email_category: EmailCategory | None = None
        if "email" in message.channels:
            email_category = await db.get(EmailCategory, message.email_category_key)
            if email_category is None or email_category.automatic or not member_mail.member_mail_available():
                # Nothing has been sent yet. Leave the message scheduled so the outbox retries
                # (and, if it stays unavailable, the job fails visibly) instead of silently
                # dropping the email channel while the others go out.
                logger.warning("composer dispatch: message_id=%s cannot send email; not dispatched.", resource_id)
                return False

        if "announcement" in message.channels:
            announcement = await announcements_service._create_uncommitted(
                db,
                actor=actor,
                body=AnnouncementCreate(
                    text_nl=message.body_nl,
                    text_fr=message.body_fr,
                    text_en=message.body_en,
                    level=cast(AnnouncementLevel, message.level),
                    active=True,
                    link_url=message.link_url,
                    link_label_nl=message.title_nl if message.link_url else None,
                    link_label_fr=message.title_fr if message.link_url else None,
                    link_label_en=message.title_en if message.link_url else None,
                ),
                request_id=None,
            )
            message.announcement_id = announcement.id

        push_audience: list[str] = []
        if "push" in message.channels:
            push_audience = list((await db.execute(select(PushSubscription.id))).scalars().all())
            for subscription_id in push_audience:
                await enqueue_job(
                    db,
                    job_type=COMPOSER_MESSAGE_PUSH,
                    resource_type="composer_push_delivery",
                    resource_id=f"{message.id}:{subscription_id}",
                    deduplication_key=f"composer-push:{message.id}:{subscription_id}",
                    actor=actor,
                    request_id=None,
                )
            message.push_audience_snapshot = push_audience

        email_audience: list[str] = []
        if email_category is not None:
            now = datetime.now(UTC)
            interval = 60 / settings.member_mail_max_per_minute
            for index, person in enumerate(await eligible_people(db, email_category)):
                job = await enqueue_job(
                    db,
                    job_type=COMPOSER_MESSAGE_EMAIL,
                    resource_type="composer_email_delivery",
                    resource_id=f"{message.id}:{person.id}",
                    deduplication_key=f"composer-email:{message.id}:{person.id}",
                    actor=actor,
                    request_id=None,
                    scheduled_at=now + timedelta(seconds=index * interval),
                )
                job.max_attempts = 1
                email_audience.append(person.id)
            message.email_audience_snapshot = email_audience

        message.state = "sent"
        message.sent_at = datetime.now(UTC)
        await write_audit_entry(
            db,
            actor=actor,
            action="composed_message_sent",
            resource_type="composed_message",
            resource_id=message.id,
            request_id=None,
            details={
                "channels": message.channels,
                "push_audience_count": len(push_audience),
                "email_audience_count": len(email_audience),
            },
        )
        await db.commit()
    return True


async def deliver_composer_push(resource_id: str) -> bool:
    """Outbox handler for ``composer_message_push`` jobs. *resource_id* is
    ``"{message_id}:{subscription_id}"`` — see module docstring."""
    message_id, _, subscription_id = resource_id.partition(":")
    if not push_enabled():
        logger.warning("Composer push delivery skipped for resource_id=%s: VAPID is not configured.", resource_id)
        return False

    async with async_session_factory() as db:
        message = await db.get(ComposedMessage, message_id)
        subscription = await db.get(PushSubscription, subscription_id)
        if message is None or subscription is None:
            # Message deleted, or subscriber unsubscribed between enqueue and delivery.
            return True

        text = _pick_locale_text(message, subscription.locale)
        if text is None:
            logger.warning("Composer push: message_id=%s has no usable text for delivery.", message_id)
            return True
        title, body = text

        hostname = urlparse(subscription.endpoint).hostname
        if not hostname or not await asyncio.to_thread(_resolves_to_public_address, hostname):
            logger.warning(
                "Retiring push subscription_id=%s: endpoint does not resolve to a public address.", subscription_id
            )
            await db.delete(subscription)
            await db.commit()
            return True

        try:
            payload = _build_composer_payload(title, body)
            await asyncio.to_thread(_send_sync, subscription, payload)
        except WebPushException as exc:
            if exc.status_code in _INVALID_SUBSCRIPTION_STATUSES:
                logger.info("Retiring push subscription_id=%s after status=%s.", subscription_id, exc.status_code)
                await db.delete(subscription)
                await db.commit()
                return True
            logger.warning("Composer push delivery failed for subscription_id=%s: %s", subscription_id, exc)
            return False
        except Exception:
            logger.exception("Unexpected error sending composer push to subscription_id=%s.", subscription_id)
            return False

        subscription.last_seen_at = datetime.now(UTC)
        await db.commit()
    return True


async def deliver_composer_email(resource_id: str) -> bool:
    """Outbox handler for ``composer_message_email`` jobs (#1407). *resource_id* is
    ``"{message_id}:{person_id}"``.

    Returns ``True`` only when the provider accepted the mail. Every other outcome raises a
    ``MemberMailNotSent`` subclass, which the outbox records as the job's error code; the job has a
    single attempt, so nothing is ever submitted twice on purpose. If a worker died after the claim
    (the lease expired and the job came back with ``attempt_count > 1``) the earlier submission may
    have gone out, so it is not repeated.
    """
    message_id, _, person_id = resource_id.partition(":")
    if not member_mail.member_mail_available():
        raise MemberMailUnavailable("Member mail is not configured.")

    async with async_session_factory() as db:
        job = await db.scalar(
            select(OutboxJob).where(OutboxJob.job_type == COMPOSER_MESSAGE_EMAIL, OutboxJob.resource_id == resource_id)
        )
        if job is not None and job.attempt_count > 1:
            raise MemberMailUncertain("An earlier attempt may have been submitted.")

        message = await db.get(ComposedMessage, message_id)
        category = await db.get(EmailCategory, message.email_category_key) if message is not None else None
        if message is None or category is None:
            raise MemberMailSkipped("The message or its category no longer exists.")
        person = await eligible_person(db, person_id, category)
        if person is None:
            raise MemberMailSkipped("The recipient is no longer eligible.")

        link = unsubscribe_url(person.id, category.key)
        rendered = render_member_mail(
            message, category, person.preferred_language, unsubscribe_page_url(person.id, category.key)
        )
        if rendered is None:
            raise MemberMailRejected("The message has no usable text.")
        subject, text = rendered
        try:
            mail = MemberMail(
                delivery_key=f"composer:{message_id}:{person_id}",
                category_key=category.key,
                recipient=person.email.strip(),
                sender=settings.member_mail_from,
                subject=subject,
                text=text,
                unsubscribe_url=link,
            )
        except ValidationError:
            raise MemberMailRejected("The mail could not be built.") from None

    await member_mail.submit(mail)
    return True
