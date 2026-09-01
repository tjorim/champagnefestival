"""Admin MCP tool implementations for registration management.

Mirrors the admin-only endpoints of ``app.routers.registrations``
(``list_registrations``, ``admin_create_registration``, ``update_registration``,
``delete_registration``). Business logic lives in
``app.services.registrations_service`` and is shared with the REST router.
The public self-service endpoints (guest-facing creation with spam/rate-limit
checks, the email-token "my registrations" lookup flow) have no MCP
equivalent — those are unauthenticated flows already reachable via the web
app, not admin management surface.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.mcp.utils import MCPToolError, as_value_error, registration_base_dict, validate_with_schema
from app.models import Event, Registration
from app.schemas import RegistrationAdminCreate, RegistrationUpdate
from app.services import registrations_service
from app.services.operational_search import person_search_predicate

DEFAULT_LIST_LIMIT = 50
MAX_LIST_LIMIT = 200


async def list_registrations(
    session_factory: Any,
    role: str,
    *,
    edition_id: str | None = None,
    event_id: str | None = None,
    status: str | None = None,
    payment_status: str | None = None,
    checked_in: bool | None = None,
    q: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> dict:
    """List registrations, newest first, with optional filters (admin equivalent of ``GET /api/registrations``).

    ``q`` matches against the registrant's name/email using the same
    normalized/fuzzy predicate as ``find_guest``. ``limit`` caps the page size
    — defaults to ``DEFAULT_LIST_LIMIT`` (50), capped at ``MAX_LIST_LIMIT``
    (200). ``offset`` skips that many matching rows. Each row is a compact
    projection (see ``registration_base_dict``); use ``get_guest_registration``
    for full detail (order items, notes) on a specific registration.
    """
    if offset < 0:
        raise MCPToolError("offset must not be negative.")
    effective_limit = DEFAULT_LIST_LIMIT if limit is None else max(1, min(limit, MAX_LIST_LIMIT))

    async with session_factory() as db:
        stmt = (
            select(Registration)
            .join(Registration.event)
            .options(selectinload(Registration.event))
            .order_by(Registration.created_at.desc(), Registration.id.desc())
        )
        if edition_id:
            stmt = stmt.where(Event.edition_id == edition_id)
        if event_id:
            stmt = stmt.where(Registration.event_id == event_id)
        if status:
            stmt = stmt.where(Registration.status == status)
        if payment_status:
            stmt = stmt.where(Registration.payment_status == payment_status)
        if checked_in is not None:
            stmt = stmt.where(Registration.checked_in == checked_in)
        if q and (q_stripped := q.strip()):
            stmt = stmt.join(Registration.person).where(person_search_predicate(name=q_stripped, email=q_stripped))
        # Fetch one extra row beyond effective_limit so its presence (not just a
        # full page) tells us whether a next page actually exists — otherwise a
        # result set that lands exactly on effective_limit rows would advertise
        # a next_offset pointing at an empty page.
        stmt = stmt.offset(offset).limit(effective_limit + 1)

        rows = list((await db.execute(stmt)).scalars().all())
        has_more = len(rows) > effective_limit
        rows = rows[:effective_limit]
        person_map = await registrations_service.fetch_person_map(db, rows)

        registrations = []
        for row in rows:
            item = registration_base_dict(row, person_map[row.person_id], role=role)
            item["edition_id"] = row.event.edition_id
            registrations.append(item)

        return {
            "registrations": registrations,
            "count": len(registrations),
            "next_offset": offset + len(registrations) if has_more else None,
        }


async def create_registration(
    session_factory: Any,
    actor: str,
    *,
    person_id: str,
    event_id: str,
    guest_count: int,
    order_items: list[dict] | None = None,
    notes: str = "",
    accessibility_note: str = "",
    status: str = "confirmed",
) -> dict:
    """Create a registration on a guest's behalf (admin equivalent of ``POST /api/registrations/admin``).

    ``order_items`` is a list of ``{"product_id": ..., "quantity": ...}``; quantities are
    resolved against the event's real active products server-side, so a caller can never
    set an arbitrary price or order a nonexistent product — see
    ``app.services.registrations_service.resolve_order_items``.
    """
    body = validate_with_schema(
        RegistrationAdminCreate,
        person_id=person_id,
        event_id=event_id,
        guest_count=guest_count,
        order_items=order_items or [],
        notes=notes,
        accessibility_note=accessibility_note,
        status=status,
    )
    async with session_factory() as db:
        try:
            return await registrations_service.admin_create_registration(db, body=body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def update_registration(
    session_factory: Any,
    actor: str,
    registration_id: str,
    *,
    guest_count: int | None = None,
    status: str | None = None,
    payment_status: str | None = None,
    amount_due: float | None = None,
    clear_amount_due: bool = False,
    table_id: str | None = None,
    clear_table: bool = False,
    confirm_over_capacity: bool = False,
    order_items: list[dict] | None = None,
    notes: str | None = None,
    accessibility_note: str | None = None,
    person_id: str | None = None,
    checked_in: bool | None = None,
    strap_issued: bool | None = None,
) -> dict:
    """Update a registration.

    ``amount_due``/``table_id`` are nullable fields with no natural "leave
    unchanged" vs "clear" signal via a plain optional parameter (0.0 is a
    valid amount_due; an empty table_id isn't meaningful) — pass
    ``clear_amount_due=True`` / ``clear_table=True`` to null them out
    instead of providing a value. ``order_items`` accepts only
    ``product_id``/``quantity`` pairs. Product metadata is resolved from the
    event and existing delivery counts are preserved (clamped to quantity).
    """
    provided = {
        k: v
        for k, v in {
            "guest_count": guest_count,
            "status": status,
            "payment_status": payment_status,
            "amount_due": amount_due,
            "table_id": table_id,
            "confirm_over_capacity": confirm_over_capacity if confirm_over_capacity else None,
            "order_items": order_items,
            "notes": notes,
            "accessibility_note": accessibility_note,
            "person_id": person_id,
            "checked_in": checked_in,
            "strap_issued": strap_issued,
        }.items()
        if v is not None
    }
    body = validate_with_schema(RegistrationUpdate, **provided)

    async with session_factory() as db:
        try:
            registration = await registrations_service.get_registration_or_404(db, registration_id)
            return await registrations_service.apply_registration_update(
                db,
                registration,
                body,
                actor=actor,
                clear_amount_due=clear_amount_due,
                clear_table=clear_table,
            )
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def delete_registration(session_factory: Any, actor: str, registration_id: str) -> dict:
    async with session_factory() as db:
        try:
            registration = await registrations_service.get_registration_or_404(db, registration_id)
            return await registrations_service.delete_registration(db, registration, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
