"""Private organization proposals, serialized with live edits on the organization row."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.config import settings
from app.models import Organization, OrganizationChange
from app.schemas import OrganizationChangeSubmit, OrganizationDescription
from app.services import organization_logos
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.services.organizations_service import DESCRIPTION_FIELDS
from app.services.outbox_service import enqueue_job

FIELDS = ("image", "website", *DESCRIPTION_FIELDS)
NOTIFICATION = "organization_change_notification"


def payload(change: OrganizationChange, organization: Organization) -> dict:
    return {
        "id": change.id,
        "organization_id": organization.id,
        "organization_name": organization.name,
        "status": change.status,
        "proposed": change.proposed,
        "current": {field: getattr(organization, field) for field in FIELDS},
        "superseded_fields": change.superseded_fields,
        "reason": change.reason,
        "created_at": change.created_at,
    }


async def lock_organization(db: AsyncSession, organization_id: int) -> Organization:
    await organization_logos.lock(db)
    row = await db.scalar(
        select(Organization)
        .where(Organization.id == organization_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise NotFoundError("Organization not found.")
    return row


async def pending(db: AsyncSession, organization_id: int) -> OrganizationChange | None:
    return await db.scalar(
        select(OrganizationChange).where(
            OrganizationChange.organization_id == organization_id, OrganizationChange.status == "pending"
        )
    )


async def audit(
    db: AsyncSession,
    change: OrganizationChange,
    action: str,
    actor: str,
    auth_source: str | None = None,
    fields: list[str] | None = None,
) -> None:
    await write_audit_entry(
        db,
        actor=actor,
        auth_source=auth_source,
        action=f"organization_change_{action}",
        resource_type="organization",
        resource_id=str(change.organization_id),
        details={"change_id": change.id, "fields": fields or sorted(change.proposed)},
    )


async def submit(
    db: AsyncSession,
    organization: Organization,
    body: OrganizationChangeSubmit,
    *,
    actor: str,
    auth_source: str | None,
    logo: bytes | None = None,
) -> dict:
    values = body.model_dump(exclude_unset=True, exclude={"submission_id"})
    if logo is not None:
        previous = await pending(db, organization.id)
        values = {**(previous.proposed if previous else {}), **values}
        values.pop("image", None)
        values["image"] = organization_logos.store(db, organization_logos.roots()[1], logo)
    if not values:
        raise ValidationFailedError("Propose at least one field.")
    # Replay the original outcome even after replacement, supersession or review.
    existing = await db.get(OrganizationChange, str(body.submission_id))
    if existing:
        if (
            existing.organization_id != organization.id
            or existing.submitted_by != actor
            or existing.submitted_values != values
        ):
            raise ConflictError("Submission ID already used for a different proposal.")
        return payload(existing, organization)
    descriptions = {field: values.get(field, getattr(organization, field)) for field in DESCRIPTION_FIELDS}
    try:
        OrganizationDescription.model_validate(descriptions).validate_original()
    except ValueError as exc:
        raise ValidationFailedError(str(exc)) from exc
    previous = await pending(db, organization.id)
    if previous:
        organization_logos.retire_pending(db, previous)
        previous.status = "replaced"
        await db.flush()
    change = OrganizationChange(
        id=str(body.submission_id),
        organization_id=organization.id,
        submitted_by=actor,
        submitted_auth_source=auth_source,
        submitted_values=values,
        proposed=values,
        status="pending",
        notification_recipient=settings.organization_review_recipient or None,
    )
    db.add(change)
    await db.flush()
    await audit(db, change, "submitted", actor, auth_source)
    if change.notification_recipient:
        await enqueue_job(
            db,
            job_type=NOTIFICATION,
            resource_type="organization_change",
            resource_id=change.id,
            deduplication_key=f"organization-change:{change.id}",
            actor=actor,
        )
    await db.commit()
    return payload(change, organization)


async def supersede(db: AsyncSession, organization: Organization, fields: set[str], *, actor: str) -> None:
    change = await pending(db, organization.id)
    if change is None:
        return
    removed = set(change.proposed).intersection(fields)
    remaining = {key: value for key, value in change.proposed.items() if key not in removed}
    # A language switch/clear can invalidate a remaining translation. Retire that
    # dependent description proposal as well rather than accepting invalid live data.
    merged = {field: remaining.get(field, getattr(organization, field)) for field in DESCRIPTION_FIELDS}
    try:
        OrganizationDescription.model_validate(merged).validate_original()
    except ValueError:
        removed.update(set(remaining).intersection(DESCRIPTION_FIELDS))
        remaining = {key: value for key, value in remaining.items() if key not in DESCRIPTION_FIELDS}
    if not removed:
        return
    if "image" in removed:
        organization_logos.retire_pending(db, change)
    change.proposed = remaining
    change.superseded_fields = sorted(set(change.superseded_fields) | removed)
    if not remaining:
        change.status = "superseded"
    await audit(db, change, "superseded", actor, fields=sorted(removed))


async def list_pending(db: AsyncSession) -> list[dict]:
    rows = (
        await db.execute(
            select(OrganizationChange, Organization)
            .join(Organization)
            .where(OrganizationChange.status == "pending")
            .order_by(OrganizationChange.created_at, OrganizationChange.id)
        )
    ).all()
    return [payload(change, organization) for change, organization in rows]


async def decide(db: AsyncSession, change_id: str, decision: str, reason: str | None, *, actor: str) -> dict:
    # Read only the parent key before locking; refresh proposal after acquiring
    # the same parent lock used by submit and every direct admin edit.
    organization_id = await db.scalar(
        select(OrganizationChange.organization_id).where(OrganizationChange.id == change_id)
    )
    if organization_id is None:
        raise NotFoundError("Proposal not found.")
    organization = await lock_organization(db, organization_id)
    change = await db.get(OrganizationChange, change_id, populate_existing=True)
    if change is None:
        raise NotFoundError("Proposal not found.")
    if change.status == decision:
        return payload(change, organization)
    if change.status != "pending":
        raise ConflictError("Proposal was already decided, superseded or replaced. Refresh the review list.")
    old_image = organization.image
    if decision == "accepted":
        for field, value in change.proposed.items():
            if field == "image":
                path = organization_logos.pending_path(change)
                value = organization_logos.PREFIX + organization_logos.store(
                    db, organization_logos.roots()[0], path.read_bytes()
                )
            setattr(organization, field, value)
    organization_logos.retire_pending(db, change)
    if decision == "accepted":
        await organization_logos.retire_public(db, old_image)
    change.status = decision
    change.reason = reason if decision == "rejected" else None
    await audit(db, change, decision, actor)
    await db.commit()
    return payload(change, organization)
