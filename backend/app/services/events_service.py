"""Shared application-service operations for events.

Used by both ``app.routers.events`` (REST) and ``app.mcp.admin.events`` (MCP)
so the off-festival edition date-cardinality check, registration-settings
validation, the registration-cascade delete guard, and audit-detail assembly
for create/update/delete live in exactly one place instead of two copies
(#860). Events raise ``HTTPException`` directly (matching the pre-existing
shared helpers this consolidates, following the same convention as
``app/services/editions_service.py``) rather than the ``ServiceError``
hierarchy in ``app/services/errors.py``; the REST router can therefore call
these functions unwrapped, while the MCP adapter translates ``HTTPException``
into ``MCPToolError`` at its own boundary (see ``app.mcp.utils.as_value_error``).
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.models import Edition, Event, Registration
from app.schemas import EventCreate, EventUpdate
from app.utils import event_to_summary_dict, get_or_404, make_id


async def get_event_or_404(db: AsyncSession, event_id: str) -> Event:
    return await get_or_404(
        db,
        Event,
        event_id,
        "Event not found.",
        options=[selectinload(Event.edition), selectinload(Event.products)],
    )


async def ensure_edition_exists(db: AsyncSession, edition_id: str) -> Edition:
    result = await db.execute(select(Edition).where(Edition.id == edition_id))
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail=f"Edition '{edition_id}' not found.")
    return edition


async def validate_standalone_event_date(
    db: AsyncSession,
    edition: Edition,
    event_date: date,
    exclude_event_id: str | None = None,
) -> None:
    """Enforce the off-festival edition event cardinality contract.

    Off-festival editions (`bourse`, `capsule_exchange`) may contain any number of events
    (e.g. separate opening, tasting, and auction entries), but every event on such an
    edition must share the same calendar date. Festival editions are unrestricted since
    they legitimately span multiple days. The public UI and admin UI both render every
    active event for an edition, so this is the only cardinality constraint enforced.
    """
    if edition.edition_type == "festival":
        return
    stmt = select(Event.date).where(Event.edition_id == edition.id)
    if exclude_event_id is not None:
        stmt = stmt.where(Event.id != exclude_event_id)
    existing_dates = {row[0] for row in (await db.execute(stmt)).all()}
    resulting_dates = existing_dates | {event_date}
    if len(resulting_dates) > 1:
        raise HTTPException(
            status_code=400,
            detail="Standalone editions may only contain events on a single date.",
        )


def validate_registration_settings(
    *,
    registration_required: bool,
    registrations_open_from: datetime | None,
    registrations_close_at: datetime | None,
    max_capacity: int | None,
) -> None:
    if (
        registrations_open_from is not None
        and registrations_close_at is not None
        and registrations_close_at <= registrations_open_from
    ):
        raise HTTPException(status_code=400, detail="registrations_close_at must be after registrations_open_from.")
    if registration_required:
        return
    if registrations_open_from is not None or registrations_close_at is not None or max_capacity is not None:
        detail = (
            "registrations_close_at may only be set when registration_required is true."
            if registrations_close_at is not None
            else "registrations_open_from and max_capacity may only be set when registration_required is true."
        )
        raise HTTPException(
            status_code=400,
            detail=detail,
        )


async def reject_if_registrations_exist(db: AsyncSession, event_id: str) -> None:
    """Block event deletion while registrations still reference it.

    ``registrations.event_id`` is non-nullable and the ORM relationship has no
    delete cascade configured (registrations carry payment/attendance/order
    history, so silently orphaning or cascading them is unsafe). Without this
    check, ``db.delete(event)`` reaches the database, which raises a raw
    ``NotNullViolationError`` that would otherwise surface driver/SQL details
    and registration row contents to the caller.
    """
    count = (
        await db.execute(select(func.count()).select_from(Registration).where(Registration.event_id == event_id))
    ).scalar_one()
    if count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot delete event: {count} registration(s) are still linked to it. Delete or reassign them first."
            ),
        )


async def create_event(db: AsyncSession, *, body: EventCreate, actor: str, request_id: str | None = None) -> dict:
    edition = await ensure_edition_exists(db, body.edition_id)
    await validate_standalone_event_date(db, edition, body.date)
    validate_registration_settings(
        registration_required=body.registration_required,
        registrations_open_from=body.registrations_open_from,
        registrations_close_at=body.registrations_close_at,
        max_capacity=body.max_capacity,
    )
    event = Event(
        id=make_id("evt"),
        edition_id=body.edition_id,
        title=body.title,
        description=body.description,
        date=body.date,
        start_time=body.start_time,
        end_time=body.end_time,
        category=body.category,
        registration_required=body.registration_required,
        registrations_open_from=body.registrations_open_from,
        registrations_close_at=body.registrations_close_at,
        max_capacity=body.max_capacity,
        active=body.active,
    )
    db.add(event)
    await write_audit_entry(
        db,
        actor=actor,
        action="event_created",
        resource_type="event",
        resource_id=event.id,
        request_id=request_id,
        details={"title": event.title, "edition_id": event.edition_id},
    )
    await db.commit()
    event = await get_event_or_404(db, event.id)
    return event_to_summary_dict(event, include_edition=True)


async def apply_event_update(
    db: AsyncSession, event: Event, body: EventUpdate, *, actor: str, request_id: str | None = None
) -> dict:
    edition = event.edition

    if "edition_id" in body.model_fields_set and body.edition_id is not None:
        edition = await ensure_edition_exists(db, body.edition_id)
        event.edition_id = body.edition_id

    fields_set = body.model_fields_set
    candidate_date = body.date if "date" in fields_set and body.date is not None else event.date
    candidate_registration_required = (
        body.registration_required
        if "registration_required" in fields_set and body.registration_required is not None
        else event.registration_required
    )
    candidate_registrations_open_from = (
        body.registrations_open_from if "registrations_open_from" in fields_set else event.registrations_open_from
    )
    candidate_registrations_close_at = (
        body.registrations_close_at if "registrations_close_at" in fields_set else event.registrations_close_at
    )
    candidate_max_capacity = body.max_capacity if "max_capacity" in fields_set else event.max_capacity
    await validate_standalone_event_date(db, edition, candidate_date, exclude_event_id=event.id)
    validate_registration_settings(
        registration_required=candidate_registration_required,
        registrations_open_from=candidate_registrations_open_from,
        registrations_close_at=candidate_registrations_close_at,
        max_capacity=candidate_max_capacity,
    )

    for field in (
        "title",
        "description",
        "date",
        "start_time",
        "end_time",
        "category",
        "registration_required",
        "registrations_open_from",
        "registrations_close_at",
        "max_capacity",
        "active",
    ):
        if field in fields_set:
            setattr(event, field, getattr(body, field))

    await write_audit_entry(
        db,
        actor=actor,
        action="event_updated",
        resource_type="event",
        resource_id=event.id,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    event = await get_event_or_404(db, event.id)
    return event_to_summary_dict(event, include_edition=True)


async def delete_event(db: AsyncSession, event: Event, *, actor: str, request_id: str | None = None) -> dict:
    event_id = event.id
    await reject_if_registrations_exist(db, event_id)
    await db.delete(event)
    await write_audit_entry(
        db,
        actor=actor,
        action="event_deleted",
        resource_type="event",
        resource_id=event_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "id": event_id}
