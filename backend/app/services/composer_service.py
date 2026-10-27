"""Draft lifecycle for the central composer (#942).

Actual delivery (announcement creation, push enqueueing, the state
transition to ``sent``) is ``app.composer_delivery``'s job, run from the
durable outbox.
This module only owns the ``draft`` half: create, update, read, and the
``schedule`` call that hands off to delivery.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import member_mail
from app.audit import write_audit_entry
from app.member_mail import MemberMailSkipped
from app.models import ComposedMessage, EmailCategory, OutboxJob, PushSubscription
from app.schemas import ComposedMessageCreate, ComposedMessageUpdate, ComposedMessageWrite
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.services.member_mail_audience import eligible_people
from app.services.outbox_service import enqueue_job
from app.utils import make_id

COMPOSER_MESSAGE_DISPATCH = "composer_message_dispatch"
_COMPOSER_MESSAGE_PUSH = "composer_message_push"
_COMPOSER_MESSAGE_EMAIL = "composer_message_email"


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


async def _estimated_push_audience(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(PushSubscription))).scalar_one()


async def _estimated_email_audience(db: AsyncSession, item: ComposedMessage) -> int:
    if "email" not in item.channels or item.email_category_key is None:
        return 0
    category = await db.get(EmailCategory, item.email_category_key)
    return len(await eligible_people(db, category)) if category is not None else 0


async def _check_email_category(db: AsyncSession, fields: dict) -> None:
    """The email channel mails the people who consented to a category an administrator may compose
    for. Automatic categories (``reward_ready``) are sent by application code, never composed."""
    if "email" not in (fields.get("channels") or []):
        return
    category = await db.get(EmailCategory, fields.get("email_category_key"))
    if category is None:
        raise NotFoundError("Email category not found.", code="email_category_not_found")
    if category.automatic:
        raise ValidationFailedError(
            f"Email category '{category.key}' is sent automatically and cannot be composed.",
            code="email_category_automatic",
        )


async def _job_result_counts(db: AsyncSession, message_id: str, job_type: str) -> dict[str, int]:
    """Count this message's per-recipient jobs of *job_type* by state.

    A push job that resolved a dead subscription (404/410) also counts as
    "delivered" — the outbox job itself completed without needing a retry,
    matching how #941's admin test-send already treats retirement as a
    terminal, non-retried outcome. Email jobs that ended because the recipient was no longer
    eligible are counted apart as "skipped". Counts only, never a subscription's
    endpoint/keys or an address — see ``ComposedMessageOut.push_delivered_count``'s docstring.
    """
    rows = (
        await db.execute(
            select(OutboxJob.state, OutboxJob.last_error_code, func.count())
            .where(
                OutboxJob.job_type == job_type,
                # startswith() auto-escapes LIKE wildcards (%, _) in the
                # literal — message_id itself contains underscores
                # (make_id's own separator), which a raw .like() pattern
                # would misinterpret as single-character wildcards.
                OutboxJob.resource_id.startswith(f"{message_id}:"),
            )
            .group_by(OutboxJob.state, OutboxJob.last_error_code)
        )
    ).all()
    counts = {"delivered": 0, "failed": 0, "skipped": 0, "pending": 0}
    for state, error_code, count in rows:
        if state == "failed" and error_code == MemberMailSkipped.__name__:
            counts["skipped"] += count
        elif state in ("pending", "processing"):
            counts["pending"] += count
        else:
            counts[state] += count
    return counts


async def _result_fields(db: AsyncSession, item: ComposedMessage) -> dict[str, int]:
    push = email = {"delivered": 0, "failed": 0, "skipped": 0, "pending": 0}
    if item.state == "sent":
        push = await _job_result_counts(db, item.id, _COMPOSER_MESSAGE_PUSH)
        email = await _job_result_counts(db, item.id, _COMPOSER_MESSAGE_EMAIL)
    return {
        "push_delivered_count": push["delivered"],
        "push_failed_count": push["failed"],
        "push_pending_count": push["pending"],
        "email_accepted_count": email["delivered"],
        "email_failed_count": email["failed"],
        "email_skipped_count": email["skipped"],
        "email_pending_count": email["pending"],
    }


async def to_dict(db: AsyncSession, item: ComposedMessage) -> dict:
    return {
        "id": item.id,
        "title_nl": item.title_nl,
        "title_fr": item.title_fr,
        "title_en": item.title_en,
        "body_nl": item.body_nl,
        "body_fr": item.body_fr,
        "body_en": item.body_en,
        "level": item.level,
        "channels": item.channels,
        "link_url": item.link_url,
        "email_category_key": item.email_category_key,
        "state": item.state,
        "scheduled_at": item.scheduled_at,
        "announcement_id": item.announcement_id,
        "push_audience_snapshot": item.push_audience_snapshot,
        "email_audience_snapshot": item.email_audience_snapshot,
        "sent_at": item.sent_at,
        "sent_by": item.sent_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "estimated_push_audience": await _estimated_push_audience(db),
        "estimated_email_audience": await _estimated_email_audience(db, item),
        "member_mail_available": member_mail.member_mail_available(),
        **await _result_fields(db, item),
    }


async def list_messages(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(ComposedMessage).order_by(ComposedMessage.created_at.desc()))
    return [await to_dict(db, item) for item in result.scalars()]


async def get_message(db: AsyncSession, message_id: str, *, for_update: bool = False) -> ComposedMessage:
    item = await db.get(ComposedMessage, message_id, with_for_update=for_update or None)
    if item is None:
        raise NotFoundError(f"Composed message '{message_id}' not found.")
    return item


async def create_draft(db: AsyncSession, *, actor: str, body: ComposedMessageCreate, request_id: str | None) -> dict:
    await _check_email_category(db, body.model_dump())
    item = ComposedMessage(id=make_id("cmp"), **body.model_dump())
    db.add(item)
    await write_audit_entry(
        db,
        actor=actor,
        action="composed_message_created",
        resource_type="composed_message",
        resource_id=item.id,
        request_id=request_id,
        details={"channels": item.channels},
    )
    await db.commit()
    await db.refresh(item)
    return await to_dict(db, item)


async def update_draft(
    db: AsyncSession, *, actor: str, message_id: str, body: ComposedMessageUpdate, request_id: str | None
) -> dict:
    # Same row lock as schedule_send, so an edit cannot commit over a message that was just scheduled.
    item = await get_message(db, message_id, for_update=True)
    if item.state != "draft":
        raise ConflictError(f"Composed message '{message_id}' is no longer a draft; it cannot be edited.")
    fields_set = body.model_fields_set
    merged = {name: getattr(item, name) for name in ComposedMessageWrite.model_fields}
    merged.update(body.model_dump(exclude_unset=True))
    try:
        ComposedMessageWrite.model_validate(merged)
    except ValidationError as exc:
        raise ValidationFailedError(str(exc)) from exc
    await _check_email_category(db, merged)
    for name in fields_set:
        setattr(item, name, merged[name])
    await write_audit_entry(
        db,
        actor=actor,
        action="composed_message_updated",
        resource_type="composed_message",
        resource_id=item.id,
        request_id=request_id,
        details={"fields_changed": sorted(fields_set)},
    )
    await db.commit()
    await db.refresh(item)
    return await to_dict(db, item)


async def schedule_send(
    db: AsyncSession,
    *,
    actor: str,
    message_id: str,
    scheduled_at: datetime | None,
    request_id: str | None,
    expected_email_audience: int | None = None,
    expected_updated_at: datetime | None = None,
) -> dict:
    """Transition ``draft`` -> ``scheduled`` and hand off to the outbox.

    Not retry-safe with a second, deliberate call once this succeeds — the
    message is no longer ``draft`` and a repeat is rejected outright; a
    retried *ambiguous* request converges safely because the state check and
    the enqueue happen in the same transaction, serialized by this row's own
    lock (see docs/retry-safety.md).
    """
    item = (
        await db.execute(select(ComposedMessage).where(ComposedMessage.id == message_id).with_for_update())
    ).scalar_one_or_none()
    if item is None:
        raise NotFoundError(f"Composed message '{message_id}' not found.")
    if item.state != "draft":
        raise ConflictError(f"Composed message '{message_id}' has already been scheduled or sent.")
    if expected_updated_at is not None and _as_utc(item.updated_at) != _as_utc(expected_updated_at):
        raise ConflictError(
            f"Composed message '{message_id}' was saved after it was reviewed.", code="composed_message_changed"
        )

    try:
        ComposedMessageWrite.model_validate({name: getattr(item, name) for name in ComposedMessageWrite.model_fields})
    except ValidationError as exc:
        raise ValidationFailedError(str(exc)) from exc

    if "email" in item.channels:
        if not member_mail.member_mail_available():
            raise ConflictError(
                "Member mail is not configured; the email channel cannot be sent.", code="member_mail_unavailable"
            )
        await _check_email_category(db, {name: getattr(item, name) for name in ComposedMessageWrite.model_fields})
        if expected_email_audience is None:
            raise ValidationFailedError(
                "Confirm the number of recipients before sending email.", code="email_audience_confirmation_required"
            )
        current = await _estimated_email_audience(db, item)
        if current != expected_email_audience:
            raise ConflictError(
                f"The email audience is now {current} people, not {expected_email_audience}.",
                code="email_audience_changed",
            )

    when = scheduled_at or datetime.now(UTC)
    item.state = "scheduled"
    item.scheduled_at = when
    item.sent_by = actor
    await enqueue_job(
        db,
        job_type=COMPOSER_MESSAGE_DISPATCH,
        resource_type="composed_message",
        resource_id=item.id,
        deduplication_key=f"composer-dispatch:{item.id}",
        actor=actor,
        request_id=request_id,
        scheduled_at=when,
    )
    await write_audit_entry(
        db,
        actor=actor,
        action="composed_message_scheduled",
        resource_type="composed_message",
        resource_id=item.id,
        request_id=request_id,
        details={"scheduled_at": when.isoformat()},
    )
    await db.commit()
    await db.refresh(item)
    return await to_dict(db, item)
