"""Preview and explicitly apply package/price changes to existing bookings."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.live import mapping, notify_live_event
from app.models import Product, Registration
from app.schemas import ProductUpdate
from app.services import product_inventory as inventory


async def change_product(
    db: AsyncSession, product_id: str, body: ProductUpdate, *, preview: bool, actor: str, request_id: str | None
):
    product = await db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found.")
    event = await inventory.lock_event(db, product.event_id)
    product = next(p for p in event.products if p.id == product_id)
    registrations = list(
        (
            await db.execute(
                select(Registration)
                .where(Registration.event_id == event.id)
                .order_by(Registration.id)
                .with_for_update()
            )
        ).scalars()
    )
    before = inventory.current_snapshot(event)
    before_stock = {p.id: p.stock for p in event.products}
    fingerprint = {
        "products": before,
        "stock": before_stock,
        "registrations": [
            [
                r.id,
                r.status,
                r.order_items,
                r.product_snapshot,
                str(r.amount_paid),
                str(r.amount_due),
                r.updated_at.isoformat(),
            ]
            for r in registrations
        ],
        "request": body.model_dump(mode="json", exclude={"preview_token", "confirm_shortage"}),
    }
    token = hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest()
    fields = body.model_dump(
        exclude_unset=True,
        exclude={"update_existing_contents", "update_existing_prices", "preview_token", "confirm_shortage"},
    )
    for key, value in fields.items():
        if value is None and key not in {"stock", "inclusions", "included_product_id", "included_per_guests"}:
            raise HTTPException(400, f"{key} cannot be null.")
        setattr(product, key, value)
    if product.inclusions is not None:
        product.included_product_id = None
        product.included_per_guests = None
    elif (product.included_product_id is None) != (product.included_per_guests is None):
        raise HTTPException(400, "included_product_id and included_per_guests must be set together.")
    if product.required and not product.purchasable:
        raise HTTPException(400, "A required product must be purchasable.")
    after = inventory.current_snapshot(event)
    inventory.validate_graph(after)
    price_changed = Decimal(before[product_id]["price"]) != Decimal(after[product_id]["price"])
    # "purchasable" counts as a contents change too (#1020): it decides
    # whether this product's line is even orderable/visible, which is
    # exactly what a package summary shows — the same as an inclusion edit.
    contents_changed = any(
        before[product_id][key] != after[product_id][key]
        for key in ("inclusions", "included_product_id", "included_per_guests", "purchasable")
    )
    changed_rows = []
    projected = []
    for registration in registrations:
        existing = registration.product_snapshot or {}
        touched = product_id in existing or any(i["product_id"] == product_id for i in registration.order_items)
        if (
            not touched
            or registration.status == "cancelled"
            or not (
                (contents_changed and body.update_existing_contents) or (price_changed and body.update_existing_prices)
            )
        ):
            projected.append((registration, registration.order_items, existing))
            continue
        # Only this changed product's node is updated; unrelated package edits
        # previously kept by this booking must not be pulled in accidentally.
        snapshot = dict(existing)
        if not snapshot:
            snapshot = {key: dict(value) for key, value in before.items()}
            for item in registration.order_items:
                if item["product_id"] in snapshot:
                    snapshot[item["product_id"]]["price"] = str(item["price"])
        node = dict(snapshot.get(product_id, before[product_id]))
        if contents_changed and body.update_existing_contents:
            node.update(
                {
                    key: after[product_id][key]
                    for key in ("inclusions", "included_product_id", "included_per_guests", "purchasable")
                }
            )
        if price_changed and body.update_existing_prices:
            node["price"] = after[product_id]["price"]
        snapshot[product_id] = node
        # Prices are already selected in the snapshot; old flat items are used
        # only to preserve delivery progress, not to override the chosen price.
        items, snapshot = inventory.resolve_booking(
            event,
            inventory.purchased_requests(registration.order_items),
            registration.guest_count,
            previous_snapshot=snapshot,
            previous_items=[
                {**i, "price": snapshot.get(i["product_id"], before.get(i["product_id"], {})).get("price", i["price"])}
                for i in registration.order_items
            ],
        )
        delivered = {i["product_id"]: i.get("delivered_quantity", 0) for i in registration.order_items}
        for item in items:
            item["delivered_quantity"] = min(delivered.get(item["product_id"], 0), item["quantity"])
            item["delivered"] = item["delivered_quantity"] == item["quantity"]
        allocated = registration.allocations
        table_quantity = sum(
            item["quantity"] for item in items if snapshot.get(item["product_id"], {}).get("unit") == "table"
        )
        if allocated and (
            (table_quantity and (len(allocated) > table_quantity or any(not a.exclusive for a in allocated)))
            or (not table_quantity and any(a.exclusive for a in allocated))
        ):
            raise HTTPException(409, "Adjust this booking's table allocations before applying the package change.")
        total = inventory.order_total(items)
        changed_rows.append(
            {
                "id": registration.id,
                "before_total": str(inventory.order_total(registration.order_items)),
                "after_total": str(total),
                "amount_paid": str(registration.amount_paid),
                "refund_due": str(max(0, registration.amount_paid - total)),
                "before_items": registration.order_items,
                "after_items": items,
            }
        )
        projected.append((registration, items, snapshot))
    totals: dict[str, int] = defaultdict(int)
    for reg, items, _ in projected:
        if reg.status != "cancelled":
            for key, qty in inventory.quantities(items).items():
                totals[key] += qty
    shortages = [
        {
            "product_id": p.id,
            "name": p.name,
            "stock": p.stock,
            "reserved": totals[p.id],
            "shortage": totals[p.id] - p.stock,
        }
        for p in event.products
        if p.stock is not None and totals[p.id] > p.stock
    ]
    result = {
        "preview_token": token,
        "bookings": changed_rows,
        "shortages": shortages,
        "price_changed": price_changed,
        "contents_changed": contents_changed,
    }
    if preview:
        return result
    requires_shortage_confirmation = bool(shortages) and (
        before_stock != {p.id: p.stock for p in event.products} or bool(changed_rows)
    )
    if (changed_rows or requires_shortage_confirmation) and body.preview_token != token:
        raise HTTPException(409, "Review a fresh preview before saving changes affecting bookings or stock shortages.")
    if requires_shortage_confirmation and not body.confirm_shortage:
        raise HTTPException(409, "Confirm the stock shortage to keep existing bookings and stop further sales.")
    for registration, items, snapshot in projected:
        if registration.order_items == items and registration.product_snapshot == snapshot:
            continue
        registration.order_items = items
        registration.product_snapshot = snapshot
        registration.amount_due = inventory.order_total(items)
        registration.payment_status = (
            "paid"
            if registration.amount_paid >= (registration.amount_due or 0)
            else "partial"
            if registration.amount_paid
            else "unpaid"
        )
        await write_audit_entry(
            db,
            actor=actor,
            action="booking_package_updated",
            resource_type="registration",
            resource_id=registration.id,
            request_id=request_id,
            details={"product_id": product.id},
        )
        await notify_live_event(
            db, mapping.order_changed(registration_id=registration.id, event_id=event.id, edition_id=event.edition_id)
        )
    await write_audit_entry(
        db,
        actor=actor,
        action="product_updated",
        resource_type="product",
        resource_id=product.id,
        request_id=request_id,
        details={
            "fields_changed": sorted(fields),
            "affected_bookings": len(changed_rows),
            "update_existing_contents": body.update_existing_contents,
            "update_existing_prices": body.update_existing_prices,
            "confirmed_shortage": bool(shortages),
        },
    )
    await db.commit()
    await db.refresh(product)
    return product
