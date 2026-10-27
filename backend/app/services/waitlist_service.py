"""Administrator-side waitlist queries and state changes shared by REST and MCP.

Public submission stays in ``app.routers.waitlist``: it is spam-guarded and
rate-limited per client, which has no equivalent for an authenticated admin.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import ListQuery
from app.models import Event, Product, WaitlistEntry
from app.services.errors import NotFoundError


def to_admin_dict(entry: WaitlistEntry) -> dict:
    return {
        "id": entry.id,
        "product_id": entry.product_id,
        "name": entry.name,
        "email": entry.email,
        "phone": entry.phone,
        "guest_count": entry.guest_count,
        "notes": entry.notes,
        "created_at": entry.created_at,
        "handled_at": entry.handled_at,
        "product_name": entry.product.name,
        "event_id": entry.product.event_id,
        "event_title": entry.product.event.title,
    }


async def list_entries(db: AsyncSession, *, product_id: str | None = None, event_id: str | None = None) -> list[dict]:
    """Oldest first, optionally narrowed to one product or one event."""
    stmt = (
        select(WaitlistEntry)
        .join(Product, Product.id == WaitlistEntry.product_id)
        .options(selectinload(WaitlistEntry.product).selectinload(Product.event))
        .order_by(WaitlistEntry.created_at)
    )
    if product_id is not None:
        stmt = stmt.where(WaitlistEntry.product_id == product_id)
    if event_id is not None:
        stmt = stmt.join(Event, Event.id == Product.event_id).where(Event.id == event_id)
    return [to_admin_dict(entry) for entry in (await db.execute(stmt)).scalars().all()]


QueueStatus = Literal["unhandled", "handled", "all"]


def _filtered_entries(
    stmt: Select[Any],
    *,
    status: QueueStatus,
    q: str | None,
    product_id: str | None,
    event_id: str | None,
) -> Select[Any]:
    """Shared by the page and its count, so the total always agrees with the rows."""
    if status == "unhandled":
        stmt = stmt.where(WaitlistEntry.handled_at.is_(None))
    elif status == "handled":
        stmt = stmt.where(WaitlistEntry.handled_at.is_not(None))
    if product_id is not None:
        stmt = stmt.where(WaitlistEntry.product_id == product_id)
    if event_id is not None:
        stmt = stmt.where(Product.event_id == event_id)
    if q:
        stmt = stmt.where(
            or_(
                *(
                    func.lower(column).contains(q.lower(), autoescape=True)
                    for column in (
                        WaitlistEntry.name,
                        WaitlistEntry.email,
                        WaitlistEntry.notes,
                        Product.name_nl,
                        Event.title_nl,
                    )
                )
            )
        )
    return stmt


async def list_entries_page(
    db: AsyncSession,
    query: ListQuery,
    *,
    status: QueueStatus = "all",
    product_id: str | None = None,
    event_id: str | None = None,
) -> dict:
    """One bounded page, oldest first (the manual waitlist order), with the full matching total."""
    base = (
        select(WaitlistEntry)
        .join(Product, Product.id == WaitlistEntry.product_id)
        .join(Event, Event.id == Product.event_id)
    )
    filtered = _filtered_entries(base, status=status, q=query.q, product_id=product_id, event_id=event_id)
    total = (await db.execute(select(func.count()).select_from(filtered.subquery()))).scalar_one()
    stmt = query.apply(
        filtered.options(selectinload(WaitlistEntry.product).selectinload(Product.event)).order_by(
            WaitlistEntry.created_at, WaitlistEntry.id
        )
    )
    entries = (await db.execute(stmt)).scalars().all()
    return query.envelope([to_admin_dict(entry) for entry in entries], total)


async def list_scopes(db: AsyncSession) -> dict:
    """Events and products that have waitlist entries, with outstanding counts, for the queue filters."""
    outstanding = func.count(WaitlistEntry.id).filter(WaitlistEntry.handled_at.is_(None))
    rows = (
        await db.execute(
            select(Product.id, Product.name_nl, Event.id, Event.title, outstanding, func.count(WaitlistEntry.id))
            .join(WaitlistEntry, WaitlistEntry.product_id == Product.id)
            .join(Event, Event.id == Product.event_id)
            .group_by(Product.id, Product.name_nl, Event.id, Event.title)
            .order_by(Event.title, Product.name_nl)
        )
    ).all()
    events: dict[str, dict] = {}
    products = []
    for product_id, product_name, event_id, event_title, open_count, all_count in rows:
        event = events.setdefault(event_id, {"id": event_id, "title": event_title, "outstanding": 0, "total": 0})
        event["outstanding"] += open_count
        event["total"] += all_count
        products.append(
            {
                "id": product_id,
                "name": product_name,
                "event_id": event_id,
                "event_title": event_title,
                "outstanding": open_count,
                "total": all_count,
            }
        )
    return {"events": list(events.values()), "products": products}


async def _get_entry(db: AsyncSession, entry_id: str) -> WaitlistEntry:
    entry = await db.get(
        WaitlistEntry,
        entry_id,
        options=[selectinload(WaitlistEntry.product).selectinload(Product.event)],
    )
    if entry is None:
        raise NotFoundError("Waitlist entry not found")
    return entry


async def mark_handled(db: AsyncSession, entry_id: str) -> dict:
    """Idempotent: an entry that is already handled keeps its original timestamp."""
    entry = await _get_entry(db, entry_id)
    if entry.handled_at is None:
        entry.handled_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(entry, attribute_names=["handled_at"])
    return to_admin_dict(entry)


async def delete_entry(db: AsyncSession, entry_id: str) -> None:
    entry = await _get_entry(db, entry_id)
    await db.delete(entry)
    await db.commit()
