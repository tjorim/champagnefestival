"""Draft lifecycle for the central composer (#942).

Actual delivery (announcement creation, push enqueueing, the state
transition to ``sent``) is ``app.composer_delivery``'s job, run from the
durable outbox — see that module and docs/decisions/942-central-composer.md.
This module only owns the ``draft`` half: create, update, read, and the
``schedule`` call that hands off to delivery.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import ComposedMessage, OutboxJob, PushSubscription
from app.schemas import ComposedMessageCreate, ComposedMessageUpdate
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.services.outbox_service import enqueue_job
from app.utils import make_id

COMPOSER_MESSAGE_DISPATCH = "composer_message_dispatch"
_COMPOSER_MESSAGE_PUSH = "composer_message_push"


async def _estimated_push_audience(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(PushSubscription))).scalar_one()


async def _push_result_counts(db: AsyncSession, message_id: str) -> dict[str, int]:
    """Aggregate this message's ``composer_message_push`` job outcomes.

    A job that resolved a dead subscription (404/410) also counts as
    "delivered" — the outbox job itself completed without needing a retry,
    matching how #941's admin test-send already treats retirement as a
    terminal, non-retried outcome. Counts only, never a subscription's
    endpoint/keys — see ``ComposedMessageOut.push_delivered_count``'s docstring.
    """
    rows = (
        await db.execute(
            select(OutboxJob.state, func.count())
            .where(
                OutboxJob.job_type == _COMPOSER_MESSAGE_PUSH,
                # startswith() auto-escapes LIKE wildcards (%, _) in the
                # literal — message_id itself contains underscores
                # (make_id's own separator), which a raw .like() pattern
                # would misinterpret as single-character wildcards.
                OutboxJob.resource_id.startswith(f"{message_id}:"),
            )
            .group_by(OutboxJob.state)
        )
    ).all()
    counts: dict[str, int] = {}
    for state, count in rows:
        counts[state] = count
    return {
        "push_delivered_count": counts.get("delivered", 0),
        "push_failed_count": counts.get("failed", 0),
        "push_pending_count": counts.get("pending", 0) + counts.get("processing", 0),
    }


async def to_dict(db: AsyncSession, item: ComposedMessage) -> dict:
    return {
        "id": item.id,
        "title_nl": item.title_nl,
        "title_en": item.title_en,
        "title_fr": item.title_fr,
        "body_nl": item.body_nl,
        "body_en": item.body_en,
        "body_fr": item.body_fr,
        "level": item.level,
        "channels": item.channels,
        "link_url": item.link_url,
        "state": item.state,
        "scheduled_at": item.scheduled_at,
        "announcement_id": item.announcement_id,
        "push_audience_snapshot": item.push_audience_snapshot,
        "sent_at": item.sent_at,
        "sent_by": item.sent_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "estimated_push_audience": await _estimated_push_audience(db),
        **(
            await _push_result_counts(db, item.id)
            if item.state == "sent"
            else {
                "push_delivered_count": 0,
                "push_failed_count": 0,
                "push_pending_count": 0,
            }
        ),
    }


async def list_messages(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(ComposedMessage).order_by(ComposedMessage.created_at.desc()))
    return [await to_dict(db, item) for item in result.scalars()]


async def get_message(db: AsyncSession, message_id: str) -> ComposedMessage:
    item = await db.get(ComposedMessage, message_id)
    if item is None:
        raise NotFoundError(f"Composed message '{message_id}' not found.")
    return item


async def create_draft(db: AsyncSession, *, actor: str, body: ComposedMessageCreate, request_id: str | None) -> dict:
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
    item = await get_message(db, message_id)
    if item.state != "draft":
        raise ConflictError(f"Composed message '{message_id}' is no longer a draft; it cannot be edited.")
    fields_set = body.model_fields_set
    for name in fields_set:
        setattr(item, name, getattr(body, name))
    if not any((item.title_nl, item.title_en, item.title_fr)):
        raise ValidationFailedError("A composed message needs at least one translated title.")
    if not any((item.body_nl, item.body_en, item.body_fr)):
        raise ValidationFailedError("A composed message needs at least one translated body.")
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
    db: AsyncSession, *, actor: str, message_id: str, scheduled_at: datetime | None, request_id: str | None
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
