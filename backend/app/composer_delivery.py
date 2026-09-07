"""Delivery for the central composer (#942): outbox handlers for the actual
send — resolving the audience, creating/publishing the announcement channel,
and enqueueing one Web Push job per targeted subscriber.

Two job types, run through the same durable outbox #947 built for email and
reused by #941's admin test-send:

- ``composer_message_dispatch`` (``deliver_composer_message_dispatch``): the
  ``scheduled -> sent`` transition itself. Runs once per composed message,
  at the requested ``scheduled_at`` (or immediately for "send now" — see
  ``app.services.composer_service.schedule_send``). Resolves the audience
  fresh at this point, not at schedule time — see
  docs/decisions/942-central-composer.md's "Snapshot timing" decision.
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
import json
import logging
from datetime import UTC, datetime
from typing import cast
from urllib.parse import urlparse

from pywebpush import WebPushException
from sqlalchemy import select

from app.audit import write_audit_entry
from app.database import async_session_factory
from app.models import ComposedMessage, PushSubscription
from app.push import (
    _INVALID_SUBSCRIPTION_STATUSES,
    _MAX_PAYLOAD_BYTES,
    _resolves_to_public_address,
    _send_sync,
    push_enabled,
)
from app.schemas import AnnouncementCreate, AnnouncementLevel
from app.services import announcements_service
from app.services.outbox_service import enqueue_job

logger = logging.getLogger(__name__)

COMPOSER_MESSAGE_PUSH = "composer_message_push"


def _pick_locale_text(message: ComposedMessage, locale: str) -> tuple[str, str] | None:
    """The message's title/body for *locale*, falling back to Dutch when
    that locale's translation is blank — a push notification needs some
    text; silently skipping a subscriber over a missing translation would
    be a worse outcome than sending the fallback-locale text."""
    title = getattr(message, f"title_{locale}", None) or message.title_nl
    body = getattr(message, f"body_{locale}", None) or message.body_nl
    if not title or not body:
        return None
    return title, body


def _build_composer_payload(title: str, body: str) -> str:
    payload = json.dumps({"title": title, "body": body})
    if len(payload.encode("utf-8")) > _MAX_PAYLOAD_BYTES:
        raise ValueError("Composed Web Push payload exceeds the maximum size.")
    return payload


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

        if "announcement" in message.channels:
            announcement = await announcements_service._create_uncommitted(
                db,
                actor=actor,
                body=AnnouncementCreate(
                    text_nl=message.body_nl,
                    text_en=message.body_en,
                    text_fr=message.body_fr,
                    level=cast(AnnouncementLevel, message.level),
                    active=True,
                    link_url=message.link_url,
                    link_label_nl=message.title_nl if message.link_url else None,
                    link_label_en=message.title_en if message.link_url else None,
                    link_label_fr=message.title_fr if message.link_url else None,
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

        message.state = "sent"
        message.sent_at = datetime.now(UTC)
        await write_audit_entry(
            db,
            actor=actor,
            action="composed_message_sent",
            resource_type="composed_message",
            resource_id=message.id,
            request_id=None,
            details={"channels": message.channels, "push_audience_count": len(push_audience)},
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
