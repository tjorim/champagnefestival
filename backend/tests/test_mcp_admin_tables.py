"""Tests for the admin (write) table MCP tools."""

from __future__ import annotations

import pytest

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


async def _seed_table_type(db_session, *, type_id: str = "ttype-1") -> None:
    db_session.add(TableType(id=type_id, name="Standard", max_capacity=6))
    await db_session.commit()


async def test_create_get_list_table(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)

    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", capacity=6, table_type_id="ttype-1", layout_id="lay-1"
    )
    assert created["name"] == "Table 1"
    assert created["capacity"] == 6
    assert created["registration_ids"] == []
    table_id = created["id"]

    fetched = await mcp_tables.get_table(factory, table_id)
    assert fetched["id"] == table_id

    listed = await mcp_tables.list_tables(factory)
    assert any(t["id"] == table_id for t in listed["tables"])


async def test_create_table_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)

    with pytest.raises(ValueError, match="rotation"):
        await mcp_tables.create_table(
            factory,
            "admin-1",
            name="Table 1",
            capacity=6,
            table_type_id="ttype-1",
            layout_id="lay-1",
            rotation=360,  # le=359
        )


async def test_create_table_type_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.create_table(
            factory, "admin-1", name="Table 1", capacity=6, table_type_id="nonexistent", layout_id="lay-1"
        )


async def test_create_table_layout_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_table_type(db_session)

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.create_table(
            factory, "admin-1", name="Table 1", capacity=6, table_type_id="ttype-1", layout_id="nonexistent"
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
        factory, "admin-1", name="Table 1", capacity=6, table_type_id="ttype-1", layout_id="lay-1"
    )

    updated = await mcp_tables.update_table(factory, "admin-1", created["id"], capacity=8)
    assert updated["capacity"] == 8
    assert updated["name"] == "Table 1"  # untouched fields survive a partial update


async def test_update_table_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", capacity=6, table_type_id="ttype-1", layout_id="lay-1"
    )

    with pytest.raises(ValueError, match="capacity"):
        await mcp_tables.update_table(factory, "admin-1", created["id"], capacity=0)  # ge=1


async def test_update_table_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.update_table(factory, "admin-1", "nonexistent", capacity=8)


async def test_update_table_type_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", capacity=6, table_type_id="ttype-1", layout_id="lay-1"
    )

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.update_table(factory, "admin-1", created["id"], table_type_id="nonexistent")


async def test_update_table_layout_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", capacity=6, table_type_id="ttype-1", layout_id="lay-1"
    )

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.update_table(factory, "admin-1", created["id"], layout_id="nonexistent")


async def test_delete_table(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    await _seed_table_type(db_session)
    created = await mcp_tables.create_table(
        factory, "admin-1", name="Table 1", capacity=6, table_type_id="ttype-1", layout_id="lay-1"
    )

    result = await mcp_tables.delete_table(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.get_table(factory, created["id"])


async def test_delete_table_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_tables.delete_table(factory, "admin-1", "nonexistent")
