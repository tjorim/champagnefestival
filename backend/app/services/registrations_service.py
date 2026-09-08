"""Shared application-service operations for admin registration management.

Used by both ``app.routers.registrations`` (REST, admin-only endpoints) and
``app.mcp.admin.registrations`` (MCP) so order-item resolution, the
table/edition consistency guard, and the update/create/delete transitions
(with their audit-detail assembly and live-bus publication) live in exactly
one place instead of two copies (#860). The public self-service endpoints
(guest-facing creation with spam/rate-limit checks, the email-token "my
registrations" lookup flow, CSV export) have no MCP equivalent and stay in
the router.

Raises ``HTTPException`` directly (matching the pre-existing shared helpers
this consolidates, same convention as ``app/services/editions_service.py``)
rather than the ``ServiceError`` hierarchy in ``app/services/errors.py``.
Person/event lookups reuse ``app.services.people_service.get_person_or_404``
and ``app.services.events_service.get_event_or_404`` directly rather than
keeping a third copy of each.
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.live import mapping as live_mapping
from app.live import notify_live_event
from app.models import Event, Layout, Person, Registration, Table
from app.schemas import (
    OrderItemRequest,
    RegistrationAdminCreate,
    RegistrationDeliveryUpdate,
    RegistrationUpdate,
)
from app.services import people_service
from app.services import product_inventory as inventory
from app.services.outbox_service import enqueue_registration_confirmation
from app.utils import make_id, registration_to_dict

logger = logging.getLogger(__name__)


async def get_registration_or_404(db: AsyncSession, registration_id: str) -> Registration:
    result = await db.execute(
        select(Registration)
        .options(
            selectinload(Registration.event).selectinload(Event.edition),
            selectinload(Registration.event).selectinload(Event.products),
        )
        .where(Registration.id == registration_id)
    )
    registration = result.scalar_one_or_none()
    if registration is None:
        raise HTTPException(status_code=404, detail="Registration not found.")
    return registration


def ensure_registration_can_check_in(registration: Registration) -> None:
    """Reject entrance mutations for a canceled registration."""
    if registration.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled registrations cannot be checked in.",
        )


async def fetch_person_map(db: AsyncSession, rows: list[Registration]) -> dict[str, Person]:
    if not rows:
        return {}
    person_ids = {row.person_id for row in rows}
    people = (await db.execute(select(Person).where(Person.id.in_(person_ids)))).scalars().all()
    return {person.id: person for person in people}


async def assert_table_matches_edition(db: AsyncSession, table_id: str, edition_id: str | None) -> None:
    """Reject seating a registration at a table belonging to another edition.

    Layouts are per-edition, so a table only makes sense for registrations of the
    edition its layout was drawn for. Layouts predating the edition link carry a
    null edition_id and are left alone.
    """
    row = (
        await db.execute(
            select(Layout.edition_id).join(Table, Table.layout_id == Layout.id).where(Table.id == table_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_id}' not found.")
    table_edition_id = row[0]
    if table_edition_id is not None and edition_id is not None and table_edition_id != edition_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Table '{table_id}' belongs to edition '{table_edition_id}', "
                f"but this registration is for edition '{edition_id}'."
            ),
        )


async def assert_table_has_room(
    db: AsyncSession,
    *,
    table_id: str,
    edition_id: str | None,
    registration_id: str,
    guest_count: int,
) -> None:
    """Lock a table and reject an assignment that exceeds its guest capacity."""
    row = (
        await db.execute(
            select(Table, Layout.edition_id)
            .join(Layout, Table.layout_id == Layout.id)
            .where(Table.id == table_id)
            .with_for_update()
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_id}' not found.")
    table, table_edition_id = row
    if table_edition_id is not None and edition_id is not None and table_edition_id != edition_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Table '{table_id}' belongs to edition '{table_edition_id}', "
                f"but this registration is for edition '{edition_id}'."
            ),
        )
    occupied = (
        await db.execute(
            select(func.coalesce(func.sum(Registration.guest_count), 0)).where(
                Registration.table_id == table_id,
                Registration.id != registration_id,
                Registration.status != "cancelled",
            )
        )
    ).scalar_one()
    if occupied + guest_count > table.capacity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Table '{table.name}' has {table.capacity - occupied} seat(s) remaining; "
                f"this party requires {guest_count}."
            ),
        )


def resolve_order_items(event: Event, requests: list[OrderItemRequest], guest_count: int) -> list[dict]:
    """Resolve a new order using current server-side prices and package rules."""
    return inventory.resolve_booking(event, requests, guest_count)[0]


def apply_delivery_updates(order_items: list[dict] | None, updates: list[RegistrationDeliveryUpdate]) -> list[dict]:
    """Apply delivery counts without trusting clients with priced order data."""
    updated = [dict(item) for item in (order_items or [])]
    by_product_id = {item.get("product_id"): item for item in updated}
    seen: set[str] = set()
    for delivery in updates:
        if delivery.product_id in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{delivery.product_id}' appears more than once in the delivery update.",
            )
        seen.add(delivery.product_id)
        item = by_product_id.get(delivery.product_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{delivery.product_id}' is not on this registration.",
            )
        quantity = int(item.get("quantity") or 0)
        if delivery.delivered_quantity > quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"delivered_quantity for product '{delivery.product_id}' cannot exceed quantity.",
            )
        item["delivered_quantity"] = delivery.delivered_quantity
        item["delivered"] = delivery.delivered_quantity == quantity
    return updated


async def admin_create_registration(
    db: AsyncSession, *, body: RegistrationAdminCreate, actor: str, request_id: str | None = None
) -> dict:
    person = await people_service.get_person_or_404(db, body.person_id)
    event = await inventory.lock_event(db, body.event_id)
    resolved_order_items, snapshot = inventory.resolve_booking(event, body.order_items, body.guest_count)
    if body.status != "cancelled":
        await inventory.check_stock(db, event, resolved_order_items)

    registration = Registration(
        id=make_id("reg"),
        event_id=event.id,
        guest_count=body.guest_count,
        notes=body.notes,
        status=body.status,
        person_id=person.id,
        check_in_token=secrets.token_urlsafe(32),
    )
    registration.order_items = resolved_order_items
    registration.product_snapshot = snapshot
    registration.amount_due = inventory.order_total(resolved_order_items) if resolved_order_items else None
    db.add(registration)
    await write_audit_entry(
        db,
        actor=actor,
        action="registration_created",
        resource_type="registration",
        resource_id=registration.id,
        request_id=request_id,
        details={"event_id": event.id, "person_id": person.id},
    )
    await enqueue_registration_confirmation(db, registration.id, actor=actor, request_id=request_id)
    await notify_live_event(
        db,
        live_mapping.registration_changed(
            action="created",
            registration_id=registration.id,
            event_id=event.id,
            edition_id=event.edition_id,
        ),
    )
    await db.commit()

    registration = await get_registration_or_404(db, registration.id)
    return registration_to_dict(registration, person, event)


async def apply_registration_update(
    db: AsyncSession,
    registration: Registration,
    body: RegistrationUpdate,
    *,
    actor: str,
    request_id: str | None = None,
    clear_amount_due: bool = False,
    clear_table: bool = False,
) -> dict:
    """Apply a partial registration update and return the refreshed payload.

    ``clear_amount_due``/``clear_table`` exist for the MCP adapter, whose
    kwargs can't distinguish "omitted" from "explicitly null" for these two
    nullable fields — REST expresses the same intent via an explicit ``null``
    in the JSON body, which already lands in ``body.model_fields_set`` and so
    never needs the flags (it always passes ``False``).
    """
    await inventory.lock_event(db, registration.event_id)
    registration = (
        await db.execute(
            select(Registration)
            .options(
                selectinload(Registration.event).selectinload(Event.edition),
                selectinload(Registration.event).selectinload(Event.products),
            )
            .where(Registration.id == registration.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()

    pre_table_id = registration.table_id
    pre_guest_count = registration.guest_count
    pre_order_items = list(registration.order_items) if registration.order_items else []
    pre_checked_in = registration.checked_in
    pre_strap_issued = registration.strap_issued
    pre_status = registration.status
    pre_payment_status = registration.payment_status
    pre_amount_due = registration.amount_due
    pre_amount_paid = registration.amount_paid
    event_id = registration.event_id
    edition_id = registration.event.edition_id

    target_status = body.status if body.status is not None else registration.status
    target_guest_count = body.guest_count if body.guest_count is not None else registration.guest_count
    if target_guest_count != registration.guest_count:
        if registration.event.max_capacity is not None and target_status != "cancelled":
            await db.execute(select(Event).where(Event.id == event_id).with_for_update())
            reserved_guest_count = (
                await db.execute(
                    select(func.coalesce(func.sum(Registration.guest_count), 0)).where(
                        Registration.event_id == event_id,
                        Registration.id != registration.id,
                        Registration.status != "cancelled",
                    )
                )
            ).scalar_one()
            if reserved_guest_count + target_guest_count > registration.event.max_capacity:
                raise HTTPException(status_code=400, detail="This event is fully booked.")
        registration.guest_count = target_guest_count

    target_checked_in = body.checked_in if body.checked_in is not None else registration.checked_in
    if target_status == "cancelled" and target_checked_in:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A checked-in registration must be unchecked before it can be cancelled.",
        )

    if body.status is not None:
        registration.status = body.status
        if body.status == "cancelled" and pre_status != "cancelled":
            registration.check_in_token = secrets.token_urlsafe(32)
    if body.payment_status is not None:
        registration.payment_status = body.payment_status
    if clear_amount_due:
        registration.amount_due = None
    elif "amount_due" in body.model_fields_set:
        registration.amount_due = body.amount_due

    table_id_targeted = clear_table or "table_id" in body.model_fields_set
    target_table_id = (
        None if clear_table else body.table_id if "table_id" in body.model_fields_set else registration.table_id
    )

    capacity_override_used = False
    capacity_may_change = table_id_targeted or body.status is not None or body.guest_count is not None
    if target_table_id is not None and registration.status != "cancelled" and capacity_may_change:
        if body.confirm_over_capacity:
            await assert_table_matches_edition(db, target_table_id, edition_id)
            capacity_override_used = True
        else:
            await assert_table_has_room(
                db,
                table_id=target_table_id,
                edition_id=edition_id,
                registration_id=registration.id,
                guest_count=registration.guest_count,
            )
    if table_id_targeted:
        registration.table_id = target_table_id

    if body.notes is not None:
        registration.notes = body.notes
    if "person_id" in body.model_fields_set:
        if body.person_id is None:
            raise HTTPException(
                status_code=400, detail="person_id cannot be removed; every registration requires a person."
            )
        await people_service.get_person_or_404(db, body.person_id)
        registration.person_id = body.person_id
    resolved_items = pre_order_items
    if body.order_items is not None or registration.guest_count != pre_guest_count:
        requests = body.order_items if body.order_items is not None else inventory.purchased_requests(pre_order_items)
        resolved_items, snapshot = inventory.resolve_booking(
            registration.event,
            requests,
            registration.guest_count,
            previous_snapshot=registration.product_snapshot,
            previous_items=pre_order_items,
        )
        registration.product_snapshot = snapshot
        if body.order_items is not None or pre_order_items:
            registration.amount_due = inventory.order_total(resolved_items)
    if target_status != "cancelled":
        # Validate against the pre-change reservation before assigning new items/status.
        registration.status = pre_status
        with db.no_autoflush:
            await inventory.check_stock(db, registration.event, resolved_items, registration=registration)
        registration.status = target_status
    registration.order_items = resolved_items
    if body.amount_paid is not None:
        registration.amount_paid = body.amount_paid
    elif body.payment_status == "paid":
        registration.amount_paid = max(registration.amount_paid or Decimal(0), registration.amount_due or Decimal(0))
    elif body.payment_status == "unpaid":
        registration.amount_paid = Decimal(0)
    if registration.amount_paid != pre_amount_paid:
        await write_audit_entry(
            db,
            actor=actor,
            action="amount_paid_updated",
            resource_type="registration",
            resource_id=registration.id,
            request_id=request_id,
            details={"previous_amount_paid": str(pre_amount_paid), "amount_paid": str(registration.amount_paid)},
        )
    if body.amount_paid is not None or body.order_items is not None:
        registration.payment_status = (
            "paid"
            if (registration.amount_paid or 0) >= (registration.amount_due or 0)
            else "partial"
            if registration.amount_paid
            else "unpaid"
        )
    if body.checked_in is not None:
        if body.checked_in and not registration.checked_in:
            registration.checked_in_at = datetime.now(UTC)
        if not body.checked_in:
            registration.checked_in_at = None
        registration.checked_in = body.checked_in
    if body.strap_issued is not None:
        registration.strap_issued = body.strap_issued

    audit_base = {"resource_type": "registration", "resource_id": registration.id, "request_id": request_id}
    if table_id_targeted and registration.table_id != pre_table_id:
        action = "table_unassigned" if registration.table_id is None else "table_assigned"
        await write_audit_entry(
            db,
            actor=actor,
            action=action,
            details={"table_id": registration.table_id, "previous_table_id": pre_table_id},
            **audit_base,
        )
    if capacity_override_used:
        await write_audit_entry(
            db,
            actor=actor,
            action="table_capacity_exceeded_confirmed",
            details={"table_id": registration.table_id, "guest_count": registration.guest_count},
            **audit_base,
        )
    if registration.guest_count != pre_guest_count:
        await write_audit_entry(
            db,
            actor=actor,
            action="guest_count_changed",
            details={"previous_guest_count": pre_guest_count, "guest_count": registration.guest_count},
            **audit_base,
        )
    if registration.order_items != pre_order_items:
        await write_audit_entry(db, actor=actor, action="order_updated", details={}, **audit_base)
    if body.checked_in is not None and registration.checked_in != pre_checked_in:
        await write_audit_entry(
            db,
            actor=actor,
            action="check_in",
            details={"checked_in": registration.checked_in},
            **audit_base,
        )
    if body.strap_issued is not None and registration.strap_issued != pre_strap_issued:
        await write_audit_entry(
            db,
            actor=actor,
            action="strap_issued",
            details={"strap_issued": registration.strap_issued},
            **audit_base,
        )
    if registration.status != pre_status or registration.payment_status != pre_payment_status:
        await write_audit_entry(
            db,
            actor=actor,
            action="registration_status_changed",
            details={
                "status": registration.status,
                "payment_status": registration.payment_status,
            },
            **audit_base,
        )
    if registration.amount_due != pre_amount_due:
        await write_audit_entry(
            db,
            actor=actor,
            action="amount_due_updated",
            details={
                "amount_due": float(registration.amount_due) if registration.amount_due is not None else None,
                "previous_amount_due": float(pre_amount_due) if pre_amount_due is not None else None,
            },
            **audit_base,
        )

    scope = {"registration_id": registration.id, "event_id": event_id, "edition_id": edition_id}
    if registration.table_id != pre_table_id:
        await notify_live_event(db, live_mapping.seating_changed(table_id=registration.table_id, **scope))
    if registration.order_items != pre_order_items:
        await notify_live_event(db, live_mapping.order_changed(**scope))
    if registration.checked_in != pre_checked_in or registration.strap_issued != pre_strap_issued:
        await notify_live_event(db, live_mapping.check_in_changed(**scope))
    metadata_fields = {
        "guest_count",
        "status",
        "payment_status",
        "amount_due",
        "amount_paid",
        "notes",
        "person_id",
    }
    if any(f in body.model_fields_set for f in metadata_fields) or clear_amount_due:
        await notify_live_event(db, live_mapping.registration_changed(action="updated", **scope))

    await db.commit()
    registration = await get_registration_or_404(db, registration.id)
    person_map = await fetch_person_map(db, [registration])

    return registration_to_dict(registration, person_map[registration.person_id], registration.event)


async def delete_registration(
    db: AsyncSession, registration: Registration, *, actor: str, request_id: str | None = None
) -> dict:
    await inventory.lock_event(db, registration.event_id)
    reg_id = registration.id
    event_id = registration.event_id
    edition_id = registration.event.edition_id
    await write_audit_entry(
        db,
        actor=actor,
        action="registration_deleted",
        resource_type="registration",
        resource_id=reg_id,
        request_id=request_id,
        details={"event_id": event_id},
    )
    await db.delete(registration)
    await notify_live_event(
        db,
        live_mapping.registration_changed(
            action="deleted",
            registration_id=reg_id,
            event_id=event_id,
            edition_id=edition_id,
        ),
    )
    await db.commit()
    return {"deleted": True, "id": reg_id}
