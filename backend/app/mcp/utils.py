"""Shared helpers and serializers for MCP tool implementations."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select

from app.models import Edition, Person, Registration

ROLE_ADMIN = "admin"
ROLE_VOLUNTEER = "volunteer"
ROLE_PUBLIC = "public"


async def get_active_edition_obj(db: Any, edition_type: str | None = "festival") -> Edition | None:
    """Return the current or next upcoming active edition, or None.

    Defaults to festival editions only, so a nearer Bourse or capsule-exchange
    edition can never stand in for the active festival in tools that omit an
    explicit edition. Pass ``edition_type=None`` to search across all types.
    """
    from sqlalchemy.orm import selectinload

    stmt = select(Edition).options(selectinload(Edition.events)).where(Edition.active.is_(True))
    if edition_type is not None:
        stmt = stmt.where(Edition.edition_type == edition_type)
    result = await db.execute(stmt)
    editions: list[Edition] = list(result.scalars().all())
    if not editions:
        return None
    today = datetime.now(UTC).date()

    def _end_date(edition: Edition) -> date | None:
        return max((ev.date for ev in edition.events), default=None)

    upcoming = [e for e in editions if (end := _end_date(e)) is not None and end >= today]
    if not upcoming:
        return None
    return min(upcoming, key=lambda e: _end_date(e) or today)


def edition_dict(edition: Edition) -> dict:
    events = sorted(edition.events, key=lambda ev: (ev.date, ev.start_time))
    return {
        "id": edition.id,
        "year": edition.year,
        "month": edition.month,
        "edition_type": edition.edition_type,
        "active": edition.active,
        "event_count": len(events),
        "dates": sorted({str(ev.date) for ev in events}),
        "venue_id": edition.venue_id,
    }


def edition_discovery_dict(edition: Edition, dates: list[date] | None = None) -> dict:
    if dates is None:
        dates = sorted({event.date for event in edition.events})
    return {
        "id": edition.id,
        "year": edition.year,
        "type": edition.edition_type,
        "date_range": {
            "start": str(dates[0]) if dates else None,
            "end": str(dates[-1]) if dates else None,
        },
        "is_active": edition.active,
    }


def event_dict(event: Any) -> dict:
    return {
        "id": event.id,
        "edition_id": event.edition_id,
        "title": event.title,
        "description": event.description,
        "date": str(event.date),
        "start_time": event.start_time,
        "end_time": event.end_time,
        "category": event.category,
        "registration_required": event.registration_required,
        "max_capacity": event.max_capacity,
        "active": event.active,
    }


def person_dict(person: Person, *, role: str) -> dict:
    """Return person fields allowed for role."""
    base: dict = {
        "id": person.id,
        "name": person.name,
    }
    if role in (ROLE_VOLUNTEER, ROLE_ADMIN):
        base["email"] = person.email
        base["phone"] = person.phone
    if role == ROLE_ADMIN:
        base["address"] = person.address
        base["club_name"] = person.club_name
        base["roles"] = person.roles
        base["notes"] = person.notes
    return base


def order_item_dict(item: Any) -> dict:
    if not isinstance(item, dict):
        item = {}
    try:
        quantity = int(item.get("quantity", 0))
    except (TypeError, ValueError):
        quantity = 0
    quantity = max(quantity, 0)

    delivered_flag = bool(item.get("delivered", False))
    delivered_quantity_raw = item.get("delivered_quantity")
    if delivered_quantity_raw is None:
        delivered_quantity = quantity if delivered_flag else 0
    else:
        try:
            delivered_quantity = int(delivered_quantity_raw)
        except (TypeError, ValueError):
            delivered_quantity = 0
    delivered_quantity = max(0, min(delivered_quantity, quantity))
    remaining_quantity = quantity - delivered_quantity

    return {
        "product_id": item.get("product_id", ""),
        "name": item.get("name", ""),
        "category": item.get("category", ""),
        "quantity": quantity,
        "price": item.get("price", 0.0),
        "delivered_quantity": delivered_quantity,
        "remaining_quantity": remaining_quantity,
        "delivered": remaining_quantity == 0,
    }


def registration_base_dict(reg: Registration, person: Person, *, role: str) -> dict:
    return {
        "id": reg.id,
        "event_id": reg.event_id,
        "person": person_dict(person, role=role),
        "guest_count": reg.guest_count,
        "table_id": reg.table_id,
        "status": reg.status,
        "payment_status": reg.payment_status,
        "checked_in": reg.checked_in,
        "checked_in_at": reg.checked_in_at.isoformat() if reg.checked_in_at else None,
        "strap_issued": reg.strap_issued,
        "accessibility_note": reg.accessibility_note,
    }
