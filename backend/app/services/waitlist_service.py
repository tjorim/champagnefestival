"""Administrator-side waitlist queries and state changes shared by REST and MCP.

Public submission stays in ``app.routers.waitlist``: it is spam-guarded and
rate-limited per client, which has no equivalent for an authenticated admin.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
