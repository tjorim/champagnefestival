"""Admin (write) MCP tool implementations for event management.

Mirrors ``app.routers.events``. Business logic — the create/update
transition, delete guard, and shared lookup/validation helpers — lives in
``app.services.events_service`` and is shared with the REST router; this
module is responsible only for validating MCP kwargs into a schema instance
and translating ``HTTPException`` into ``MCPToolError`` at its own boundary.

A read-only ``list_events``/``get_event_schedule`` tool already covers
per-edition event listing elsewhere, so this module intentionally does not
add another one.
"""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from app.mcp.utils import as_value_error, validate_with_schema
from app.schemas import EventCreate, EventUpdate
from app.services import events_service
from app.utils import event_to_summary_dict


async def create_event(
    session_factory: Any,
    actor: str,
    *,
    edition_id: str,
    title: str,
    date: dt_date,
    start_time: str,
    category: str,
    description: str = "",
    end_time: str | None = None,
    registration_required: bool = False,
    registrations_open_from: datetime | None = None,
    registrations_close_at: datetime | None = None,
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
        registrations_close_at=registrations_close_at,
        max_capacity=max_capacity,
        active=active,
    )
    async with session_factory() as db:
        try:
            return await events_service.create_event(db, body=body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def get_event(session_factory: Any, event_id: str) -> dict:
    async with session_factory() as db:
        try:
            event = await events_service.get_event_or_404(db, event_id)
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
    date: dt_date | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    category: str | None = None,
    registration_required: bool | None = None,
    registrations_open_from: datetime | None = None,
    registrations_close_at: datetime | None = None,
    max_capacity: int | None = None,
    active: bool | None = None,
    clear_end_time: bool = False,
    clear_registrations_open_from: bool = False,
    clear_registrations_close_at: bool = False,
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
            "registrations_close_at": registrations_close_at,
            "max_capacity": max_capacity,
            "active": active,
        }.items()
        if v is not None
    }
    if clear_end_time:
        provided["end_time"] = None
    if clear_registrations_open_from:
        provided["registrations_open_from"] = None
    if clear_registrations_close_at:
        provided["registrations_close_at"] = None
    if clear_max_capacity:
        provided["max_capacity"] = None
    body = validate_with_schema(EventUpdate, **provided)

    async with session_factory() as db:
        try:
            event = await events_service.get_event_or_404(db, event_id)
            return await events_service.apply_event_update(db, event, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def delete_event(session_factory: Any, actor: str, event_id: str) -> dict:
    async with session_factory() as db:
        try:
            event = await events_service.get_event_or_404(db, event_id)
            return await events_service.delete_event(db, event, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
