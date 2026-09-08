"""Event-serialized stock reservations and immutable booking package snapshots."""

from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Event, Registration
from app.schemas import OrderItemBase, OrderItemRequest


async def lock_event(db: AsyncSession, event_id: str) -> Event:
    # Every inventory writer takes this lock before any registration locks.
    # Load products after acquiring it to see the preceding writer's changes.
    event = (await db.execute(select(Event).where(Event.id == event_id).with_for_update())).scalar_one_or_none()
    if event is None:
        raise HTTPException(404, "Event not found.")
    return (
        await db.execute(
            select(Event)
            .where(Event.id == event_id)
            .options(selectinload(Event.products), selectinload(Event.edition))
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


def current_snapshot(event: Event) -> dict:
    return {
        p.id: {
            "product_id": p.id,
            "name": p.name,
            "price": str(p.price),
            "category": p.category,
            "unit": p.unit or "item",
            "active": p.active,
            "required": p.required,
            "inclusions": deepcopy(p.inclusions),
            "included_product_id": p.included_product_id,
            "included_per_guests": p.included_per_guests,
        }
        for p in event.products
    }


def validate_graph(snapshot: dict) -> None:
    visited: set[str] = set()
    visiting: set[str] = set()

    def visit(product_id: str):
        if product_id in visiting:
            raise HTTPException(400, "Packages cannot contain circular inclusions.")
        if product_id in visited:
            return
        if product_id not in snapshot:
            raise HTTPException(400, "Included products must belong to this event.")
        if len(visiting) >= 50:
            raise HTTPException(400, "Packages cannot nest more than 50 levels.")
        visiting.add(product_id)
        node = snapshot[product_id]
        edges = node.get("inclusions")
        if edges is None:
            edges = [{"product_id": node["included_product_id"]}] if node.get("included_product_id") else []
        targets = [edge["product_id"] for edge in edges]
        if len(targets) != len(set(targets)):
            raise HTTPException(400, "A package cannot include the same product more than once.")
        for target in targets:
            visit(target)
        visiting.remove(product_id)
        visited.add(product_id)

    for key in snapshot:
        visit(key)


def resolve_booking(
    event: Event,
    requests: list[OrderItemRequest],
    guest_count: int,
    *,
    previous_snapshot: dict | None = None,
    previous_items: list[dict] | None = None,
    refresh_contents: bool = False,
    refresh_prices: bool = False,
) -> tuple[list[dict], dict]:
    current = current_snapshot(event)
    graph = deepcopy(current)
    for key, old in (previous_snapshot or {}).items():
        if not refresh_contents:
            graph[key] = deepcopy(old)
        if not refresh_prices and key in graph:
            graph[key]["price"] = old["price"]
    old_items = {item["product_id"]: item for item in (previous_items or [])}
    if not refresh_prices:
        for key, old in old_items.items():
            if key in graph:
                graph[key]["price"] = str(old["price"])
    validate_graph(graph)
    ordered: dict[str, int] = defaultdict(int)
    for req in requests:
        node = graph.get(req.product_id)
        if node is None or (not current.get(req.product_id, {}).get("active") and req.product_id not in old_items):
            raise HTTPException(400, f"Product '{req.product_id}' is not available for this event.")
        ordered[req.product_id] += req.quantity
    required = {key for key, node in current.items() if node["active"] and node["required"]}
    if required and set(ordered) - required and not set(ordered) & required:
        raise HTTPException(400, "This event requires a required product before optional products can be ordered.")

    included: dict[str, int] = defaultdict(int)
    used: set[str] = set()
    visits = 0

    def expand(key: str, quantity: int):
        nonlocal visits
        visits += 1
        if visits > 10000:
            raise HTTPException(400, "Package expansion is too complex.")
        used.add(key)
        node = graph[key]
        edges = node.get("inclusions")
        if edges is None:
            # Preserve legacy bundle semantics for products not edited yet.
            target = node.get("included_product_id")
            per = node.get("included_per_guests")
            if target and per and target in graph and graph[target]["active"]:
                qty = guest_count // per
                if qty:
                    included[target] += qty
                    expand(target, qty)
            return
        for edge in edges:
            target = edge["product_id"]
            numerator = quantity * edge["quantity"]
            denominator = edge["per_quantity"]
            qty = (numerator + denominator - 1) // denominator if edge["rounding"] == "up" else numerator // denominator
            if qty:
                included[target] += qty
                if included[target] > 1000000:
                    raise HTTPException(400, "Expanded package quantity is too large.")
                expand(target, qty)

    for key, qty in ordered.items():
        expand(key, qty)
    items = []
    for key in dict.fromkeys([*ordered, *included]):
        node = graph[key]
        quantity = ordered.get(key, 0) + included.get(key, 0)
        delivered = min(int(old_items.get(key, {}).get("delivered_quantity") or 0), quantity)
        items.append(
            OrderItemBase(
                product_id=key,
                name=node["name"],
                price=float(node["price"]),
                category=node["category"],
                quantity=quantity,
                included_quantity=included.get(key, 0),
                delivered_quantity=delivered,
            ).model_dump()
        )
    return items, {key: graph[key] for key in used}


def purchased_requests(items: list[dict]) -> list[OrderItemRequest]:
    return [
        OrderItemRequest(product_id=i["product_id"], quantity=i["quantity"] - i.get("included_quantity", 0))
        for i in items
        if i["quantity"] > i.get("included_quantity", 0)
    ]


def order_total(items: list[dict]) -> Decimal:
    total = sum(
        (Decimal(str(i["price"])) * (i["quantity"] - i.get("included_quantity", 0)) for i in items), Decimal(0)
    ).quantize(Decimal("0.01"))
    if total > Decimal("99999999.99"):
        raise HTTPException(400, "The booking total exceeds the supported monetary amount.")
    return total


def quantities(items: list[dict]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    for item in items:
        totals[item["product_id"]] += item["quantity"]
    return totals


async def check_stock(
    db: AsyncSession, event: Event, items: list[dict], *, registration: Registration | None = None
) -> None:
    """Caller holds event lock. Existing shortages may shrink, never grow here."""
    rows = (
        (
            await db.execute(
                select(Registration).where(
                    Registration.event_id == event.id,
                    Registration.status != "cancelled",
                    *([Registration.id != registration.id] if registration else []),
                )
            )
        )
        .scalars()
        .all()
    )
    occupied: dict[str, int] = defaultdict(int)
    for row in rows:
        for key, qty in quantities(row.order_items).items():
            occupied[key] += qty
    old = quantities(registration.order_items) if registration and registration.status != "cancelled" else {}
    for key, qty in quantities(items).items():
        product = next((p for p in event.products if p.id == key), None)
        if product and product.stock is not None and occupied[key] + qty > product.stock and qty > old.get(key, 0):
            raise HTTPException(
                409, f"Not enough stock for '{product.name}'. {max(0, product.stock - occupied[key])} available."
            )
