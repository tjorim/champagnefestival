"""Admin (write) MCP tool implementations for event management.

Mirrors ``app.routers.events``. The event response payload is built by
``event_to_summary_dict(event, include_edition=True)`` (the same serializer the
REST ``get_event`` endpoint returns), so ``get_event``/``create_event``/
``update_event`` reuse it directly. Off-festival edition date cardinality and
registration-settings validation are also reused from the router
(``_validate_standalone_event_date``, ``_validate_registration_settings``)
rather than re-derived, with their ``HTTPException``s converted via
``as_value_error``.

A read-only ``list_events``/``get_event_schedule`` tool already covers
per-edition event listing elsewhere, so this module intentionally does not
add another one.
"""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from app.audit import write_audit_entry
from app.mcp.utils import as_value_error, validate_with_schema
from app.models import Event
from app.routers.events import (
    _ensure_edition_exists,
    _get_event_or_404,
    _validate_registration_settings,
    _validate_standalone_event_date,
)
from app.schemas import EventCreate, EventUpdate
from app.utils import event_to_summary_dict, make_id


async def create_event(
    session_factory: Any,
    actor: str,
    *,
    edition_id: str,
    title: str,
    date: dt_date | str,
    start_time: str,
    category: str,
    description: str = "",
    end_time: str | None = None,
    registration_required: bool = False,
    registrations_open_from: datetime | str | None = None,
    max_capacity: int | None = None,
    active: bool = True,
) -> dict:
    body = validate_with_schema(
        EventCreate,
        edition_id=edition_id,
        title=title,
        description=description,
        date=date,
        start_time=start_time,
        end_time=end_time,
        category=category,
        registration_required=registration_required,
        registrations_open_from=registrations_open_from,
        max_capacity=max_capacity,
        active=active,
    )
    async with session_factory() as db:
        try:
            edition = await _ensure_edition_exists(db, body.edition_id)
            await _validate_standalone_event_date(db, edition, body.date)
            _validate_registration_settings(
                registration_required=body.registration_required,
                registrations_open_from=body.registrations_open_from,
                max_capacity=body.max_capacity,
            )
        except HTTPException as exc:
            raise as_value_error(exc) from exc

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
            details={"title": event.title, "edition_id": event.edition_id},
        )
        await db.commit()
        try:
            event = await _get_event_or_404(db, event.id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return event_to_summary_dict(event, include_edition=True)


async def get_event(session_factory: Any, event_id: str) -> dict:
    async with session_factory() as db:
        try:
            event = await _get_event_or_404(db, event_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return event_to_summary_dict(event, include_edition=True)


async def update_event(
    session_factory: Any,
    actor: str,
    event_id: str,
    *,
    edition_id: str | None = None,
    title: str | None = None,
    description: str | None = None,
    date: dt_date | str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    category: str | None = None,
    registration_required: bool | None = None,
    registrations_open_from: datetime | str | None = None,
    max_capacity: int | None = None,
    active: bool | None = None,
    clear_end_time: bool = False,
    clear_registrations_open_from: bool = False,
    clear_max_capacity: bool = False,
) -> dict:
    """Partially update an event; omitted fields are left unchanged.

    ``end_time``/``registrations_open_from``/``max_capacity`` are nullable with
    no natural "clear" value via a plain optional parameter (there's no
    ambiguity-free way to tell "leave unchanged" apart from "unset it" through
    a bare ``None`` default) — pass ``clear_end_time=True`` /
    ``clear_registrations_open_from=True`` / ``clear_max_capacity=True`` to
    null them out instead of providing a value.
    """
    provided: dict[str, Any] = {
        k: v
        for k, v in {
            "edition_id": edition_id,
            "title": title,
            "description": description,
            "date": date,
            "start_time": start_time,
            "end_time": end_time,
            "category": category,
            "registration_required": registration_required,
            "registrations_open_from": registrations_open_from,
            "max_capacity": max_capacity,
            "active": active,
        }.items()
        if v is not None
    }
    if clear_end_time:
        provided["end_time"] = None
    if clear_registrations_open_from:
        provided["registrations_open_from"] = None
    if clear_max_capacity:
        provided["max_capacity"] = None
    body = validate_with_schema(EventUpdate, **provided)

    async with session_factory() as db:
        try:
            event = await _get_event_or_404(db, event_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        edition = event.edition

        if body.edition_id is not None:
            try:
                edition = await _ensure_edition_exists(db, body.edition_id)
            except HTTPException as exc:
                raise as_value_error(exc) from exc
            event.edition_id = body.edition_id

        fields_set = body.model_fields_set
        # `body.date`/`body.registration_required` are typed `X | None`, so narrow
        # each via its own `is not None` check (not just fields_set membership) —
        # ty can't narrow across a fields_set lookup, only a same-branch None check.
        candidate_date = body.date if "date" in fields_set and body.date is not None else event.date
        candidate_registration_required = (
            body.registration_required
            if "registration_required" in fields_set and body.registration_required is not None
            else event.registration_required
        )
        candidate_registrations_open_from = (
            body.registrations_open_from if "registrations_open_from" in fields_set else event.registrations_open_from
        )
        candidate_max_capacity = body.max_capacity if "max_capacity" in fields_set else event.max_capacity
        try:
            await _validate_standalone_event_date(db, edition, candidate_date, exclude_event_id=event.id)
            _validate_registration_settings(
                registration_required=candidate_registration_required,
                registrations_open_from=candidate_registrations_open_from,
                max_capacity=candidate_max_capacity,
            )
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        for field in (
            "title",
            "description",
            "date",
            "start_time",
            "end_time",
            "category",
            "registration_required",
            "registrations_open_from",
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
            details={"fields_changed": sorted(body.model_fields_set)},
        )
        await db.commit()
        try:
            event = await _get_event_or_404(db, event.id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return event_to_summary_dict(event, include_edition=True)


async def delete_event(session_factory: Any, actor: str, event_id: str) -> dict:
    async with session_factory() as db:
        try:
            event = await _get_event_or_404(db, event_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        await db.delete(event)
        await write_audit_entry(
            db,
            actor=actor,
            action="event_deleted",
            resource_type="event",
            resource_id=event_id,
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": event_id}
