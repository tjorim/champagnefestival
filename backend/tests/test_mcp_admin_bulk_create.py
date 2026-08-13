"""Tests for the admin (write) bulk-create MCP tools (#837).

Mirrors ``test_bulk_create.py`` (the REST surface) so both surfaces are
verified against the same atomicity/idempotency contract. Business logic
lives in ``app.services.*_service.bulk_create_*`` and is shared with REST.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import pytest
from sqlalchemy import select

from app.mcp.admin import layouts as mcp_layouts
from app.mcp.admin import rooms as mcp_rooms
from app.mcp.admin import table_types as mcp_table_types
from app.mcp.admin import tables as mcp_tables
from app.models import IdempotencyKey, Layout, Room, Table, TableType, Venue
from app.schemas import LayoutCreate, RoomCreate, TableCreate, TableTypeCreate
from tests.helpers import mcp_session_factory


def _normalize(value: Any) -> Any:
    """Recursively convert datetime/date values to ISO strings.

    A replayed idempotent result comes back with the timestamps it was
    stored with (already ISO strings, see ``app.services.idempotency``),
    while a fresh call returns live ``datetime`` objects — normalising both
    lets the tests assert the results are equivalent regardless of which
    Python type carries the timestamp (the wire format is identical either
    way once FastMCP serialises the response to JSON).
    """
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


async def _seed_venue(db_session, venue_id: str = "venue-1") -> Venue:
    venue = Venue(id=venue_id, name="Test Venue")
    db_session.add(venue)
    await db_session.commit()
    return venue


async def _seed_room(db_session, venue_id: str = "venue-1", room_id: str = "room-1") -> Room:
    room = Room(id=room_id, venue_id=venue_id, name="Main Hall", width_m=25.0, length_m=18.0)
    db_session.add(room)
    await db_session.commit()
    return room


async def _seed_table_type(db_session, venue_id: str = "venue-1", type_id: str = "ttype-1") -> TableType:
    tt = TableType(id=type_id, name="Standard", venue_id=venue_id, width_m=0.7, length_m=1.8, max_capacity=6)
    db_session.add(tt)
    await db_session.commit()
    return tt


async def _seed_layout(db_session, room_id: str = "room-1", layout_id: str = "lay-1", day_id: int = 1) -> Layout:
    lay = Layout(id=layout_id, edition_id=None, room_id=room_id, day_id=day_id)
    db_session.add(lay)
    await db_session.commit()
    return lay


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------


async def test_bulk_create_rooms_happy_path(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    items = [
        RoomCreate(venue_id="venue-1", name="Room A", width_m=10, length_m=10),
        RoomCreate(venue_id="venue-1", name="Room B", width_m=12, length_m=12),
    ]
    result = await mcp_rooms.bulk_create_rooms(factory, "admin-1", items=items)
    assert [r["name"] for r in result["items"]] == ["Room A", "Room B"]

    rows = (await db_session.execute(select(Room))).scalars().all()
    assert len(rows) == 2


async def test_bulk_create_rooms_rolls_back_on_partial_failure(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    items = [
        RoomCreate(venue_id="venue-1", name="Room A", width_m=10, length_m=10),
        RoomCreate(venue_id="nonexistent", name="Room B", width_m=10, length_m=10),
    ]
    with pytest.raises(ValueError, match="not found"):
        await mcp_rooms.bulk_create_rooms(factory, "admin-1", items=items)

    rows = (await db_session.execute(select(Room))).scalars().all()
    assert rows == []


async def test_bulk_create_rooms_idempotency_key_replays_result(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    items = [RoomCreate(venue_id="venue-1", name="Room A", width_m=10, length_m=10)]

    first = await mcp_rooms.bulk_create_rooms(factory, "admin-1", items=items, idempotency_key="mcp-retry-key")
    second = await mcp_rooms.bulk_create_rooms(factory, "admin-1", items=items, idempotency_key="mcp-retry-key")
    assert _normalize(second) == _normalize(first)

    rows = (await db_session.execute(select(Room))).scalars().all()
    assert len(rows) == 1


async def test_bulk_create_rooms_idempotency_key_reused_with_different_payload_conflicts(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    await mcp_rooms.bulk_create_rooms(
        factory,
        "admin-1",
        items=[RoomCreate(venue_id="venue-1", name="Room A", width_m=10, length_m=10)],
        idempotency_key="shared-key",
    )
    with pytest.raises(ValueError, match="different request"):
        await mcp_rooms.bulk_create_rooms(
            factory,
            "admin-1",
            items=[RoomCreate(venue_id="venue-1", name="Room B", width_m=10, length_m=10)],
            idempotency_key="shared-key",
        )

    rows = (await db_session.execute(select(Room))).scalars().all()
    assert len(rows) == 1


async def test_bulk_create_rooms_stores_idempotency_key_scoped_to_rooms(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    await mcp_rooms.bulk_create_rooms(
        factory,
        "admin-1",
        items=[RoomCreate(venue_id="venue-1", name="Room A", width_m=10, length_m=10)],
        idempotency_key="scoped-key",
    )

    row = (await db_session.execute(select(IdempotencyKey).where(IdempotencyKey.key == "scoped-key"))).scalar_one()
    assert row.scope == "rooms.bulk_create"


# ---------------------------------------------------------------------------
# Table types
# ---------------------------------------------------------------------------


async def test_bulk_create_table_types_happy_path(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    items = [
        TableTypeCreate(venue_id="venue-1", name="Type A", width_m=0.7, length_m=1.8, max_capacity=6),
        TableTypeCreate(venue_id="venue-1", name="Type B", width_m=0.7, length_m=1.8, max_capacity=8),
    ]
    result = await mcp_table_types.bulk_create_table_types(factory, "admin-1", items=items)
    assert [tt["name"] for tt in result["items"]] == ["Type A", "Type B"]

    rows = (await db_session.execute(select(TableType))).scalars().all()
    assert len(rows) == 2


async def test_bulk_create_table_types_rolls_back_on_partial_failure(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    items = [
        TableTypeCreate(venue_id="venue-1", name="Type A", width_m=0.7, length_m=1.8, max_capacity=6),
        TableTypeCreate(venue_id="nonexistent", name="Type B", width_m=0.7, length_m=1.8, max_capacity=6),
    ]
    with pytest.raises(ValueError, match="not found"):
        await mcp_table_types.bulk_create_table_types(factory, "admin-1", items=items)

    rows = (await db_session.execute(select(TableType))).scalars().all()
    assert rows == []


async def test_bulk_create_table_types_idempotency_key_replays_result(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    items = [TableTypeCreate(venue_id="venue-1", name="Type A", width_m=0.7, length_m=1.8, max_capacity=6)]

    first = await mcp_table_types.bulk_create_table_types(factory, "admin-1", items=items, idempotency_key="tt-key")
    second = await mcp_table_types.bulk_create_table_types(factory, "admin-1", items=items, idempotency_key="tt-key")
    assert _normalize(second) == _normalize(first)

    rows = (await db_session.execute(select(TableType))).scalars().all()
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


async def test_bulk_create_tables_happy_path(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    await _seed_room(db_session)
    await _seed_table_type(db_session)
    await _seed_layout(db_session)

    items = [
        TableCreate(name="Table A", capacity=4, table_type_id="ttype-1", layout_id="lay-1"),
        TableCreate(name="Table B", capacity=4, table_type_id="ttype-1", layout_id="lay-1"),
    ]
    result = await mcp_tables.bulk_create_tables(factory, "admin-1", items=items)
    assert [t["name"] for t in result["items"]] == ["Table A", "Table B"]
    assert all(t["registration_ids"] == [] for t in result["items"])

    rows = (await db_session.execute(select(Table))).scalars().all()
    assert len(rows) == 2


async def test_bulk_create_tables_rolls_back_on_partial_failure(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    await _seed_room(db_session)
    await _seed_table_type(db_session)
    await _seed_layout(db_session)

    items = [
        TableCreate(name="Table A", capacity=4, table_type_id="ttype-1", layout_id="lay-1"),
        TableCreate(name="Table B", capacity=4, table_type_id="ttype-1", layout_id="nonexistent"),
    ]
    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.bulk_create_tables(factory, "admin-1", items=items)

    rows = (await db_session.execute(select(Table))).scalars().all()
    assert rows == []


async def test_bulk_create_tables_idempotency_key_replays_result(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    await _seed_room(db_session)
    await _seed_table_type(db_session)
    await _seed_layout(db_session)
    items = [TableCreate(name="Table A", capacity=4, table_type_id="ttype-1", layout_id="lay-1")]

    first = await mcp_tables.bulk_create_tables(factory, "admin-1", items=items, idempotency_key="table-key")
    second = await mcp_tables.bulk_create_tables(factory, "admin-1", items=items, idempotency_key="table-key")
    assert _normalize(second) == _normalize(first)

    rows = (await db_session.execute(select(Table))).scalars().all()
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# Layouts
# ---------------------------------------------------------------------------


async def test_bulk_create_layouts_happy_path(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    await _seed_room(db_session)

    items = [LayoutCreate(room_id="room-1", day_id=1), LayoutCreate(room_id="room-1", day_id=2)]
    result = await mcp_layouts.bulk_create_layouts(factory, "admin-1", items=items)
    assert [lay["day_id"] for lay in result["items"]] == [1, 2]

    rows = (await db_session.execute(select(Layout))).scalars().all()
    assert len(rows) == 2


async def test_bulk_create_layouts_rejects_duplicate_within_batch(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    await _seed_room(db_session)

    items = [LayoutCreate(room_id="room-1", day_id=1), LayoutCreate(room_id="room-1", day_id=1)]
    with pytest.raises(ValueError, match="Duplicate layout"):
        await mcp_layouts.bulk_create_layouts(factory, "admin-1", items=items)

    rows = (await db_session.execute(select(Layout))).scalars().all()
    assert rows == []


async def test_bulk_create_layouts_rolls_back_on_partial_failure(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    await _seed_room(db_session)

    items = [LayoutCreate(room_id="room-1", day_id=1), LayoutCreate(room_id="nonexistent", day_id=1)]
    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.bulk_create_layouts(factory, "admin-1", items=items)

    rows = (await db_session.execute(select(Layout))).scalars().all()
    assert rows == []


async def test_bulk_create_layouts_idempotency_key_replays_result(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    await _seed_room(db_session)
    items = [LayoutCreate(room_id="room-1", day_id=1)]

    first = await mcp_layouts.bulk_create_layouts(factory, "admin-1", items=items, idempotency_key="layout-key")
    second = await mcp_layouts.bulk_create_layouts(factory, "admin-1", items=items, idempotency_key="layout-key")
    assert _normalize(second) == _normalize(first)

    rows = (await db_session.execute(select(Layout))).scalars().all()
    assert len(rows) == 1
