"""Fake ORM rows and sessions for the MCP tool tests (no database needed)."""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock


def make_access_token(roles: list[str]) -> Any:
    """Return a minimal fake FastMCP AccessToken with realm_access roles."""
    return SimpleNamespace(claims={"realm_access": {"roles": roles}})


def make_session_factory(db: Any):
    """Return a minimal async context-manager session factory."""

    class _CM:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *_):
            pass

    class _Factory:
        def __call__(self):
            return _CM()

    return _Factory()


def make_edition(
    *,
    edition_id: str = "2026-march",
    year: int = 2026,
    month: str = "march",
    active: bool = True,
    events: list | None = None,
    venue_id: str = "venue-1",
) -> Any:
    ed = MagicMock()
    ed.id = edition_id
    ed.year = year
    ed.month = month
    ed.active = active
    ed.venue_id = venue_id
    ed.edition_type = "festival"
    ed.events = events or []
    ed.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    ed.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
    return ed


def make_event(
    *,
    event_id: str = "ev-1",
    edition_id: str = "2026-march",
    event_date: date = date(2026, 3, 21),
    active: bool = True,
) -> Any:
    ev = MagicMock()
    ev.id = event_id
    ev.edition_id = edition_id
    ev.title = "Vrijdagavond"
    ev.description = "Festival evening"
    ev.date = event_date
    ev.start_time = time.fromisoformat("18:00")
    ev.end_time = time.fromisoformat("22:00")
    ev.category = "festival"
    ev.registration_required = True
    ev.active = active
    ev.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    ev.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
    return ev


def make_person(
    *,
    person_id: str = "per-1",
    name: str = "Jean Dupont",
    email: str = "jean@example.com",
    phone: str = "+32499000000",
    address: str = "Rue de la Paix 1",
    roles: list | None = None,
    notes: str = "",
) -> Any:
    p = MagicMock()
    p.id = person_id
    p.name = name
    p.email = email
    p.phone = phone
    p.address = address
    p.roles = roles or []
    p.notes = notes
    return p


def make_registration(
    *,
    reg_id: str = "reg-1",
    person_id: str = "per-1",
    event_id: str = "ev-1",
    table_id: str | None = "tbl-1",
    guest_count: int = 2,
    checked_in: bool = False,
    checked_in_at: datetime | None = None,
    strap_issued: bool = False,
    status: str = "confirmed",
    payment_status: str = "paid",
    order_items: list | None = None,
    accessibility_note: str = "",
) -> Any:
    r = MagicMock()
    r.id = reg_id
    r.person_id = person_id
    r.event_id = event_id
    r.table_id = table_id
    r.allocations = [SimpleNamespace(table_id=table_id, guest_count=guest_count, exclusive=False)] if table_id else []
    r.guest_count = guest_count
    r.checked_in = checked_in
    r.checked_in_at = checked_in_at
    r.strap_issued = strap_issued
    r.status = status
    r.payment_status = payment_status
    r.accessibility_note = accessibility_note
    r.order_items = (
        order_items
        if order_items is not None
        else [
            {
                "product_id": "champ-std",
                "name": "Standard Champagne",
                "quantity": 2,
                "delivered_quantity": 0,
                "price": 65.0,
                "category": "champagne",
                "delivered": False,
            }
        ]
    )
    for item in r.order_items:
        item.setdefault("delivered_quantity", item["quantity"] if item.get("delivered") else 0)
    return r


def make_table(
    *,
    table_id: str = "tbl-1",
    name: str = "Table A",
    capacity: int = 6,
    layout_id: str = "lay-1",
) -> Any:
    t = MagicMock()
    t.id = table_id
    t.name = name
    t.capacity = capacity
    t.layout_id = layout_id
    return t


def make_layout(
    *,
    layout_id: str = "lay-1",
    edition_id: str = "2026-march",
    room_id: str = "room-1",
    day_id: int = 1,
) -> Any:
    lay = MagicMock()
    lay.id = layout_id
    lay.edition_id = edition_id
    lay.room_id = room_id
    lay.event_id = f"event-{day_id}"
    room = MagicMock()
    room.id = room_id
    room.name = "Main Hall"
    lay.room = room
    return lay


def make_venue(*, venue_id: str = "venue-1", name: str = "Salle des Fêtes") -> Any:
    v = MagicMock()
    v.id = venue_id
    v.name = name
    return v


def make_db_execute(rows_by_call: list[Any]):
    """Return a mock db whose execute() returns successive rows."""
    call_count = [0]

    async def _execute(_stmt):
        idx = min(call_count[0], len(rows_by_call) - 1)
        call_count[0] += 1
        result = MagicMock()
        rows = rows_by_call[idx]
        if isinstance(rows, list):
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=rows)
            result.scalars = MagicMock(return_value=scalars)
            result.scalar_one_or_none = MagicMock(return_value=rows[0] if rows else None)
            result.all = MagicMock(return_value=[(r,) for r in rows])
        else:
            # Single value
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=[rows] if rows else [])
            result.scalars = MagicMock(return_value=scalars)
            result.scalar_one_or_none = MagicMock(return_value=rows)
            result.all = MagicMock(return_value=[])
        return result

    db = MagicMock()
    db.execute = _execute
    return db
