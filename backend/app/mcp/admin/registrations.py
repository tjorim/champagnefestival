"""Admin (write) MCP tool implementations for registration management.

Mirrors the admin-only endpoints of ``app.routers.registrations``
(``admin_create_registration``, ``update_registration``, ``delete_registration``).
The public self-service endpoints (guest-facing creation with spam/rate-limit
checks, the email-token "my registrations" lookup flow) have no MCP
equivalent — those are unauthenticated flows already reachable via the web
app, not admin management surface.
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException

from app.audit import write_audit_entry
from app.live import live_bus
from app.live import mapping as live_mapping
from app.mcp.utils import as_value_error, validate_with_schema
from app.models import Registration
from app.routers.registrations import (
    _assert_table_matches_edition,
    _fetch_person_map,
    _get_event_or_404,
    _get_person_or_404,
    _get_registration_or_404,
    _resolve_order_items,
    _sum_delivered,
)
from app.schemas import RegistrationAdminCreate, RegistrationUpdate
from app.utils import make_id, registration_to_dict

logger = logging.getLogger(__name__)


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
    set an arbitrary price or order a nonexistent product — see ``_resolve_order_items``.
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
            person = await _get_person_or_404(db, body.person_id)
            event = await _get_event_or_404(db, body.event_id)
            resolved_order_items = _resolve_order_items(event, body.order_items, body.guest_count)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        registration = Registration(
            id=make_id("reg"),
            event_id=event.id,
            guest_count=body.guest_count,
            notes=body.notes,
            accessibility_note=body.accessibility_note,
            status=body.status,
            person_id=person.id,
            check_in_token=secrets.token_urlsafe(32),
        )
        registration.order_items = resolved_order_items
        db.add(registration)
        await write_audit_entry(
            db,
            actor=actor,
            action="registration_created",
            resource_type="registration",
            resource_id=registration.id,
            details={"event_id": event.id, "person_id": person.id},
        )
        await db.commit()

        registration = await _get_registration_or_404(db, registration.id)
        try:
            await live_bus.publish(
                live_mapping.registration_changed(
                    action="created",
                    registration_id=registration.id,
                    event_id=registration.event_id,
                    edition_id=registration.event.edition_id,
                )
            )
        except Exception:
            logger.warning("live_bus.publish failed for registration %s", registration.id, exc_info=True)
        return registration_to_dict(registration, person, event)


async def update_registration(
    session_factory: Any,
    actor: str,
    registration_id: str,
    *,
    status: str | None = None,
    payment_status: str | None = None,
    amount_due: float | None = None,
    clear_amount_due: bool = False,
    table_id: str | None = None,
    clear_table: bool = False,
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
    instead of providing a value. ``order_items`` takes full order lines
    (``product_id``, ``name``, ``quantity``, ``price``, ``category``,
    ``delivered_quantity``, ...) as this is how delivery/order edits are
    made — see ``OrderItemBase``.
    """
    provided = {
        k: v
        for k, v in {
            "status": status,
            "payment_status": payment_status,
            "amount_due": amount_due,
            "table_id": table_id,
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
            registration = await _get_registration_or_404(db, registration_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        _pre_table_id = registration.table_id
        _pre_order_items = list(registration.order_items) if registration.order_items else []
        _pre_delivery_sum = _sum_delivered(registration.order_items)
        _pre_checked_in = registration.checked_in
        _pre_strap_issued = registration.strap_issued
        _pre_status = registration.status
        _pre_payment_status = registration.payment_status
        _pre_amount_due = registration.amount_due
        _event_id = registration.event_id
        _edition_id = registration.event.edition_id

        # `provided` only ever carries non-None values (see the dict comprehension
        # above), so `body.<field> is not None` is exactly "the caller passed this
        # kwarg" — using `is not None` here (instead of `model_fields_set`) also lets
        # the type checker narrow `body.<field>` from `X | None` to `X` in each block.
        order_items_changed = False
        checked_in_changed = False
        strap_issued_changed = False
        table_id_changed = False

        if body.status is not None:
            registration.status = body.status
        if body.payment_status is not None:
            registration.payment_status = body.payment_status
        if clear_amount_due:
            registration.amount_due = None
        elif body.amount_due is not None:
            registration.amount_due = body.amount_due
        if clear_table:
            registration.table_id = None
            table_id_changed = True
        elif body.table_id is not None:
            try:
                await _assert_table_matches_edition(db, body.table_id, _edition_id)
            except HTTPException as exc:
                raise as_value_error(exc) from exc
            registration.table_id = body.table_id
            table_id_changed = True
        if body.notes is not None:
            registration.notes = body.notes
        if body.accessibility_note is not None:
            registration.accessibility_note = body.accessibility_note
        if body.person_id is not None:
            try:
                await _get_person_or_404(db, body.person_id)
            except HTTPException as exc:
                raise as_value_error(exc) from exc
            registration.person_id = body.person_id
        if body.order_items is not None:
            registration.order_items = [item.model_dump() for item in body.order_items]
            order_items_changed = True
        if body.checked_in is not None:
            if body.checked_in and not registration.checked_in:
                registration.checked_in_at = datetime.now(UTC)
            if not body.checked_in:
                registration.checked_in_at = None
            registration.checked_in = body.checked_in
            checked_in_changed = True
        if body.strap_issued is not None:
            registration.strap_issued = body.strap_issued
            strap_issued_changed = True

        _audit_base = {"resource_type": "registration", "resource_id": registration.id}
        if table_id_changed and registration.table_id != _pre_table_id:
            action = "table_unassigned" if registration.table_id is None else "table_assigned"
            await write_audit_entry(
                db,
                actor=actor,
                action=action,
                details={"table_id": registration.table_id, "previous_table_id": _pre_table_id},
                **_audit_base,
            )
        if order_items_changed and registration.order_items != _pre_order_items:
            action = (
                "delivery_updated" if _sum_delivered(registration.order_items) != _pre_delivery_sum else "order_updated"
            )
            await write_audit_entry(db, actor=actor, action=action, details={}, **_audit_base)
        if checked_in_changed and registration.checked_in != _pre_checked_in:
            await write_audit_entry(
                db,
                actor=actor,
                action="check_in",
                details={"checked_in": registration.checked_in},
                **_audit_base,
            )
        if strap_issued_changed and registration.strap_issued != _pre_strap_issued:
            await write_audit_entry(
                db,
                actor=actor,
                action="strap_issued",
                details={"strap_issued": registration.strap_issued},
                **_audit_base,
            )
        if registration.status != _pre_status or registration.payment_status != _pre_payment_status:
            await write_audit_entry(
                db,
                actor=actor,
                action="registration_status_changed",
                details={"status": registration.status, "payment_status": registration.payment_status},
                **_audit_base,
            )
        if registration.amount_due != _pre_amount_due:
            await write_audit_entry(
                db,
                actor=actor,
                action="amount_due_updated",
                details={
                    "amount_due": float(registration.amount_due) if registration.amount_due is not None else None,
                    "previous_amount_due": float(_pre_amount_due) if _pre_amount_due is not None else None,
                },
                **_audit_base,
            )

        await db.commit()
        registration = await _get_registration_or_404(db, registration.id)
        person_map = await _fetch_person_map(db, [registration])

        try:
            _scope = {"registration_id": registration.id, "event_id": _event_id, "edition_id": _edition_id}
            if registration.table_id != _pre_table_id:
                await live_bus.publish(live_mapping.seating_changed(table_id=registration.table_id, **_scope))
            if order_items_changed and registration.order_items != _pre_order_items:
                if _sum_delivered(registration.order_items) != _pre_delivery_sum:
                    await live_bus.publish(live_mapping.delivery_changed(**_scope))
                else:
                    await live_bus.publish(live_mapping.order_changed(**_scope))
            if registration.checked_in != _pre_checked_in or registration.strap_issued != _pre_strap_issued:
                await live_bus.publish(live_mapping.check_in_changed(**_scope))
            metadata_provided = any(
                [
                    status is not None,
                    payment_status is not None,
                    amount_due is not None or clear_amount_due,
                    notes is not None,
                    accessibility_note is not None,
                    person_id is not None,
                ]
            )
            if metadata_provided:
                await live_bus.publish(live_mapping.registration_changed(action="updated", **_scope))
        except Exception:
            logger.warning("live_bus.publish failed for registration %s", registration.id, exc_info=True)

        return registration_to_dict(registration, person_map[registration.person_id], registration.event)


async def delete_registration(session_factory: Any, actor: str, registration_id: str) -> dict:
    async with session_factory() as db:
        try:
            registration = await _get_registration_or_404(db, registration_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        _reg_id = registration.id
        _event_id = registration.event_id
        _edition_id = registration.event.edition_id
        await write_audit_entry(
            db,
            actor=actor,
            action="registration_deleted",
            resource_type="registration",
            resource_id=_reg_id,
            details={"event_id": _event_id},
        )
        await db.delete(registration)
        await db.commit()
        try:
            await live_bus.publish(
                live_mapping.registration_changed(
                    action="deleted",
                    registration_id=_reg_id,
                    event_id=_event_id,
                    edition_id=_edition_id,
                )
            )
        except Exception:
            logger.warning("live_bus.publish failed for deleted registration %s", _reg_id, exc_info=True)
        return {"deleted": True, "id": _reg_id}
