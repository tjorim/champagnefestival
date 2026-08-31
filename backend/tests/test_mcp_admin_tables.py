"""Tests for the admin (write) table MCP tools."""

from __future__ import annotations

import pytest

from app.live import live_bus
from app.mcp.admin import tables as mcp_tables
from app.models import Layout, Room, TableType, Venue
from tests.helpers import mcp_session_factory


async def _seed_layout(db_session, *, layout_id: str = "lay-1") -> None:
    venue = Venue(id="venue-1", name="Test Venue")
    db_session.add(venue)
    await db_session.flush()
    room = Room(id="room-1", venue_id="venue-1", name="Main Hall")
    db_session.add(room)
    await db_session.flush()
    layout = Layout(id=layout_id, edition_id=None, room_id="room-1", day_id=1)
    db_session.add(layout)
    await db_session.commit()


async def _seed_table_type(db_session, *, type_id: str = "ttype-1", venue_id: str = "venue-ttype-1") -> None:
    # A dedicated venue id (distinct from `_seed_layout`'s "venue-1") so this helper
    # works standalone, without depending on call order relative to `_seed_layout`.
    db_session.add(Venue(id=venue_id, name="Test Venue"))
    await db_session.flush()
    db_session.add(TableType(id=type_id, name="Standard", venue_id=venue_id, capacity=6))
    await db_session.commit()


async def test_create_get_list_table(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)

    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"
    )
    assert created["name"] == "Table 1"
    assert created["capacity"] == 6
    assert created["registration_ids"] == []
    table_id = created["id"]

    fetched = await mcp_tables.get_table(factory, table_id)
    assert fetched["id"] == table_id

    listed = await mcp_tables.list_tables(factory)
    assert any(t["id"] == table_id for t in listed["tables"])


async def test_list_tables_filters_by_layout_id(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session, layout_id="lay-1")
    db_session.add(Layout(id="lay-2", edition_id=None, room_id="room-1", day_id=2))
    await db_session.commit()
    await _seed_table_type(db_session)

    created_a = await mcp_tables.create_table(factory, "admin-1", name="A1", table_type_id="ttype-1", layout_id="lay-1")
    await mcp_tables.create_table(factory, "admin-1", name="B1", table_type_id="ttype-1", layout_id="lay-2")

    listed = await mcp_tables.list_tables(factory, layout_id="lay-1")
    assert [t["id"] for t in listed["tables"]] == [created_a["id"]]


async def test_create_table_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)

    with pytest.raises(ValueError, match="rotation"):
        await mcp_tables.create_table(
            factory,
            "admin-1",
            name="Table 1",
            table_type_id="ttype-1",
            layout_id="lay-1",
            rotation=360,  # le=359
        )


async def test_create_table_type_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.create_table(
            factory, "admin-1", name="Table 1", table_type_id="nonexistent", layout_id="lay-1"
        )


async def test_create_table_layout_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_table_type(db_session)

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.create_table(
            factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="nonexistent"
        )


async def test_get_table_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.get_table(factory, "nonexistent")


async def test_update_table_partial(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"
    )

    updated = await mcp_tables.update_table(factory, "admin-1", created["id"], name="Renamed")
    assert updated["capacity"] == 6
    assert updated["name"] == "Renamed"
    assert updated["layout_id"] == "lay-1"  # untouched fields survive a partial update


async def test_update_table_rejects_removed_capacity_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"
    )

    with pytest.raises(TypeError, match="capacity"):
        await mcp_tables.update_table(factory, "admin-1", created["id"], capacity=4)  # ty: ignore[unknown-argument]


async def test_update_table_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.update_table(factory, "admin-1", "nonexistent")


async def test_update_table_type_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"
    )

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.update_table(factory, "admin-1", created["id"], table_type_id="nonexistent")


async def test_update_table_layout_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"
    )

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.update_table(factory, "admin-1", created["id"], layout_id="nonexistent")


async def test_delete_table(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"
    )

    result = await mcp_tables.delete_table(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.get_table(factory, created["id"])


async def test_delete_table_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.delete_table(factory, "admin-1", "nonexistent")


async def test_create_table_publishes_seating_changed_event(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)

    async with live_bus.subscribe() as queue:
        created = await mcp_tables.create_table(
            factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"
        )
        event = queue.get_nowait()

    assert event.topic == "seating"
    assert event.action == "created"
    assert event.scope.table_id == created["id"]


async def test_update_table_publishes_seating_changed_event(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"
    )

    async with live_bus.subscribe() as queue:
        await mcp_tables.update_table(factory, "admin-1", created["id"])
        event = queue.get_nowait()

    assert event.topic == "seating"
    assert event.action == "updated"
    assert event.scope.table_id == created["id"]


async def test_delete_table_publishes_seating_changed_event(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"
    )

    async with live_bus.subscribe() as queue:
        await mcp_tables.delete_table(factory, "admin-1", created["id"])
        event = queue.get_nowait()

    assert event.topic == "seating"
    assert event.action == "deleted"
    assert event.scope.table_id == created["id"]
