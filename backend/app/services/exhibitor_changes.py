"""Private exhibitor proposals, serialized with live edits on the exhibitor row."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.config import settings
from app.models import Exhibitor, ExhibitorChange
from app.schemas import ExhibitorChangeSubmit, ExhibitorDescription
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.services.exhibitors_service import DESCRIPTION_FIELDS
from app.services.outbox_service import enqueue_job

FIELDS = ("website", *DESCRIPTION_FIELDS)
NOTIFICATION = "exhibitor_change_notification"


def payload(change: ExhibitorChange, exhibitor: Exhibitor) -> dict:
    return {
        "id": change.id,
        "exhibitor_id": exhibitor.id,
        "exhibitor_name": exhibitor.name,
        "status": change.status,
        "proposed": change.proposed,
        "current": {field: getattr(exhibitor, field) for field in FIELDS},
        "superseded_fields": change.superseded_fields,
        "reason": change.reason,
        "created_at": change.created_at,
    }


async def lock_exhibitor(db: AsyncSession, exhibitor_id: int) -> Exhibitor:
    row = await db.scalar(
        select(Exhibitor)
        .where(Exhibitor.id == exhibitor_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise NotFoundError("Exhibitor not found.")
    return row


async def pending(db: AsyncSession, exhibitor_id: int) -> ExhibitorChange | None:
    return await db.scalar(
        select(ExhibitorChange).where(ExhibitorChange.exhibitor_id == exhibitor_id, ExhibitorChange.status == "pending")
    )


async def audit(
    db: AsyncSession,
    change: ExhibitorChange,
    action: str,
    actor: str,
    auth_source: str | None = None,
    fields: list[str] | None = None,
) -> None:
    await write_audit_entry(
        db,
        actor=actor,
        auth_source=auth_source,
        action=f"exhibitor_change_{action}",
        resource_type="exhibitor",
        resource_id=str(change.exhibitor_id),
        details={"change_id": change.id, "fields": fields or sorted(change.proposed)},
    )


async def submit(
    db: AsyncSession, exhibitor: Exhibitor, body: ExhibitorChangeSubmit, *, actor: str, auth_source: str | None
) -> dict:
    values = body.model_dump(exclude_unset=True, exclude={"submission_id"})
    if not values:
        raise ValidationFailedError("Propose at least one field.")
    # Replay the original outcome even after replacement, supersession or review.
    existing = await db.get(ExhibitorChange, str(body.submission_id))
    if existing:
        if (
            existing.exhibitor_id != exhibitor.id
            or existing.submitted_by != actor
            or existing.submitted_values != values
        ):
            raise ConflictError("Submission ID already used for a different proposal.")
        return payload(existing, exhibitor)
    descriptions = {field: values.get(field, getattr(exhibitor, field)) for field in DESCRIPTION_FIELDS}
    try:
        ExhibitorDescription.model_validate(descriptions).validate_original()
    except ValueError as exc:
        raise ValidationFailedError(str(exc)) from exc
    previous = await pending(db, exhibitor.id)
    if previous:
        previous.status = "replaced"
        await db.flush()
    change = ExhibitorChange(
        id=str(body.submission_id),
        exhibitor_id=exhibitor.id,
        submitted_by=actor,
        submitted_auth_source=auth_source,
        submitted_values=values,
        proposed=values,
        status="pending",
        notification_recipient=settings.exhibitor_review_recipient or None,
    )
    db.add(change)
    await db.flush()
    await audit(db, change, "submitted", actor, auth_source)
    if change.notification_recipient:
        await enqueue_job(
            db,
            job_type=NOTIFICATION,
            resource_type="exhibitor_change",
            resource_id=change.id,
            deduplication_key=f"exhibitor-change:{change.id}",
            actor=actor,
        )
    await db.commit()
    return payload(change, exhibitor)


async def supersede(db: AsyncSession, exhibitor: Exhibitor, fields: set[str], *, actor: str) -> None:
    change = await pending(db, exhibitor.id)
    if change is None:
        return
    removed = set(change.proposed).intersection(fields)
    remaining = {key: value for key, value in change.proposed.items() if key not in removed}
    # A language switch/clear can invalidate a remaining translation. Retire that
    # dependent description proposal as well rather than accepting invalid live data.
    merged = {field: remaining.get(field, getattr(exhibitor, field)) for field in DESCRIPTION_FIELDS}
    try:
        ExhibitorDescription.model_validate(merged).validate_original()
    except ValueError:
        removed.update(set(remaining).intersection(DESCRIPTION_FIELDS))
        remaining = {key: value for key, value in remaining.items() if key not in DESCRIPTION_FIELDS}
    if not removed:
        return
    change.proposed = remaining
    change.superseded_fields = sorted(set(change.superseded_fields) | removed)
    if not remaining:
        change.status = "superseded"
    await audit(db, change, "superseded", actor, fields=sorted(removed))


async def list_pending(db: AsyncSession) -> list[dict]:
    rows = (
        await db.execute(
            select(ExhibitorChange, Exhibitor)
            .join(Exhibitor)
            .where(ExhibitorChange.status == "pending")
            .order_by(ExhibitorChange.created_at, ExhibitorChange.id)
        )
    ).all()
    return [payload(change, exhibitor) for change, exhibitor in rows]


async def decide(db: AsyncSession, change_id: str, decision: str, reason: str | None, *, actor: str) -> dict:
    # Read only the parent key before locking; refresh proposal after acquiring
    # the same parent lock used by submit and every direct admin edit.
    exhibitor_id = await db.scalar(select(ExhibitorChange.exhibitor_id).where(ExhibitorChange.id == change_id))
    if exhibitor_id is None:
        raise NotFoundError("Proposal not found.")
    exhibitor = await lock_exhibitor(db, exhibitor_id)
    change = await db.get(ExhibitorChange, change_id, populate_existing=True)
    if change is None:
        raise NotFoundError("Proposal not found.")
    if change.status == decision:
        return payload(change, exhibitor)
    if change.status != "pending":
        raise ConflictError("Proposal was already decided, superseded or replaced. Refresh the review list.")
    if decision == "accepted":
        for field, value in change.proposed.items():
            setattr(exhibitor, field, value)
    change.status = decision
    change.reason = reason if decision == "rejected" else None
    await audit(db, change, decision, actor)
    await db.commit()
    return payload(change, exhibitor)
