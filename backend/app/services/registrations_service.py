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
from typing import cast

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.live import live_bus
from app.live import mapping as live_mapping
from app.models import Event, Layout, Person, Product, Registration, Table
from app.schemas import (
    OrderItemBase,
    OrderItemCategory,
    OrderItemRequest,
    RegistrationAdminCreate,
    RegistrationDeliveryUpdate,
    RegistrationUpdate,
)
from app.services import events_service, people_service
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
    """Resolve client-supplied product_id/quantity pairs against the event's real,
    active products, snapshotting name/price/category server-side (see Product's
    docstring). Rejects any product_id that isn't an active product on this event,
    so a client can never set an arbitrary price or order a nonexistent product.

    Also enforces that a required product (e.g. an entry ticket) is present
    whenever an optional one is ordered — an event with required products
    configured rejects an order for optional add-ons alone — and applies each
    ordered product's bundle (Product.included_product_id/included_per_guests):
    a free quantity of the bundled product, scaled to guest_count, is merged
    into that product's line item on top of anything explicitly requested.
    """
    products_by_id: dict[str, Product] = {p.id: p for p in event.products if p.active}

    # product_id -> (quantity, included_quantity)
    line_items: dict[str, tuple[int, int]] = {}
    ordered_ids: set[str] = set()
    for req in requests:
        product = products_by_id.get(req.product_id)
        if product is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{req.product_id}' is not available for this event.",
            )
        ordered_ids.add(product.id)
        quantity, included_quantity = line_items.get(product.id, (0, 0))
        line_items[product.id] = (quantity + req.quantity, included_quantity)

    required_ids = {p.id for p in products_by_id.values() if p.required}
    if required_ids and (ordered_ids - required_ids) and not (ordered_ids & required_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event requires a required product (e.g. an entry ticket) before any optional products can be ordered.",
        )

    for product_id in list(ordered_ids):
        product = products_by_id[product_id]
        # A zero/negative included_per_guests can't happen through the REST/MCP
        # schemas (which require >= 1), but guard the division defensively
        # against a row that reached the database some other way.
        if product.included_product_id is None or not product.included_per_guests or product.included_per_guests < 1:
            continue
        target = products_by_id.get(product.included_product_id)
        if target is None:
            continue  # bundled product archived since — inclusion silently no longer applies
        included_qty = guest_count // product.included_per_guests
        if included_qty <= 0:
            continue
        quantity, included_quantity = line_items.get(target.id, (0, 0))
        line_items[target.id] = (quantity + included_qty, included_quantity + included_qty)

    resolved: list[dict] = []
    for product_id, (quantity, included_quantity) in line_items.items():
        product = products_by_id[product_id]
        resolved.append(
            OrderItemBase(
                product_id=product.id,
                name=product.name,
                quantity=quantity,
                price=float(product.price),
                category=cast(OrderItemCategory, product.category),
                included_quantity=included_quantity,
            ).model_dump()
        )
    return resolved


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
    event = await events_service.get_event_or_404(db, body.event_id)
    resolved_order_items = resolve_order_items(event, body.order_items, body.guest_count)

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
        request_id=request_id,
        details={"event_id": event.id, "person_id": person.id},
    )
    await enqueue_registration_confirmation(db, registration.id, actor=actor, request_id=request_id)
    await db.commit()

    registration = await get_registration_or_404(db, registration.id)
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
    event_id = registration.event_id
    edition_id = registration.event.edition_id

    target_guest_count = body.guest_count if body.guest_count is not None else registration.guest_count
    if target_guest_count != registration.guest_count:
        if registration.event.max_capacity is not None and registration.status != "cancelled":
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

    target_status = body.status if body.status is not None else registration.status
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
    if body.accessibility_note is not None:
        registration.accessibility_note = body.accessibility_note
    if "person_id" in body.model_fields_set:
        if body.person_id is None:
            raise HTTPException(
                status_code=400, detail="person_id cannot be removed; every registration requires a person."
            )
        await people_service.get_person_or_404(db, body.person_id)
        registration.person_id = body.person_id
    if body.order_items is not None or registration.guest_count != pre_guest_count:
        delivered_by_product = {
            item.get("product_id"): int(item.get("delivered_quantity") or 0) for item in pre_order_items
        }
        requests = body.order_items
        if requests is None:
            requests = [
                OrderItemRequest(
                    product_id=str(item["product_id"]),
                    quantity=max(0, int(item.get("quantity") or 0) - int(item.get("included_quantity") or 0)),
                )
                for item in pre_order_items
                if int(item.get("quantity") or 0) - int(item.get("included_quantity") or 0) > 0
            ]
        resolved_items = resolve_order_items(registration.event, requests, registration.guest_count)
        for item in resolved_items:
            delivered_quantity = min(delivered_by_product.get(item["product_id"], 0), item["quantity"])
            item["delivered_quantity"] = delivered_quantity
            item["delivered"] = delivered_quantity == item["quantity"]
        registration.order_items = resolved_items
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

    await db.commit()
    registration = await get_registration_or_404(db, registration.id)
    person_map = await fetch_person_map(db, [registration])

    # Publish live-update events; bus errors must never break write responses.
    try:
        scope = {"registration_id": registration.id, "event_id": event_id, "edition_id": edition_id}
        if registration.table_id != pre_table_id:
            await live_bus.publish(live_mapping.seating_changed(table_id=registration.table_id, **scope))
        if registration.order_items != pre_order_items:
            await live_bus.publish(live_mapping.order_changed(**scope))
        if registration.checked_in != pre_checked_in or registration.strap_issued != pre_strap_issued:
            await live_bus.publish(live_mapping.check_in_changed(**scope))
        metadata_fields = {"guest_count", "status", "payment_status", "amount_due", "notes", "accessibility_note", "person_id"}
        if any(f in body.model_fields_set for f in metadata_fields) or clear_amount_due:
            await live_bus.publish(live_mapping.registration_changed(action="updated", **scope))
    except Exception:
        logger.warning("live_bus.publish failed for registration %s", registration.id, exc_info=True)

    return registration_to_dict(registration, person_map[registration.person_id], registration.event)


async def delete_registration(
    db: AsyncSession, registration: Registration, *, actor: str, request_id: str | None = None
) -> dict:
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
    await db.commit()
    try:
        await live_bus.publish(
            live_mapping.registration_changed(
                action="deleted",
                registration_id=reg_id,
                event_id=event_id,
                edition_id=edition_id,
            )
        )
    except Exception:
        logger.warning("live_bus.publish failed for deleted registration %s", reg_id, exc_info=True)
    return {"deleted": True, "id": reg_id}
