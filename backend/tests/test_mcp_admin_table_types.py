"""Tests for the admin (write) table type MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import table_types as mcp_table_types
from app.models import Layout, Room, Table, Venue
from tests.helpers import mcp_session_factory


async def _seed_venue(db_session, venue_id: str = "venue-1") -> Venue:
    venue = Venue(id=venue_id, name="Test Venue")
    db_session.add(venue)
    await db_session.commit()
    return venue


async def test_create_get_list_table_type(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    created = await mcp_table_types.create_table_type(
        factory, "admin-1", name="Standard", venue_id="venue-1", width_m=0.7, length_m=1.8, capacity=6
    )
    assert created["name"] == "Standard"
    assert created["venue_id"] == "venue-1"
    assert created["capacity"] == 6
    type_id = created["id"]

    fetched = await mcp_table_types.get_table_type(factory, type_id)
    assert fetched["id"] == type_id

    listed = await mcp_table_types.list_table_types(factory)
    assert any(tt["id"] == type_id for tt in listed["table_types"])


async def test_create_table_type_venue_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_table_types.create_table_type(
            factory, "admin-1", name="Standard", venue_id="nonexistent", width_m=0.7, length_m=1.8, capacity=6
        )


async def test_create_table_type_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    with pytest.raises(ValueError, match="capacity"):
        await mcp_table_types.create_table_type(
            factory, "admin-1", name="Standard", venue_id="venue-1", width_m=0.7, length_m=1.8, capacity=51
        )  # le=50


async def test_create_table_type_rejects_missing_dimensions(db_session):
    """width_m/length_m have no defensible default and must be provided explicitly (#835)."""
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    with pytest.raises(TypeError):
        await mcp_table_types.create_table_type(factory, "admin-1", name="Standard", venue_id="venue-1", capacity=6)  # ty: ignore[missing-argument]


async def test_create_table_type_round_shape_uses_larger_dimension_as_diameter(db_session):
    """Round tables have a single diameter — whichever field the caller actually used to
    express it (width_m or length_m) must be respected, not silently discarded (#835)."""
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    created = await mcp_table_types.create_table_type(
        factory,
        "admin-1",
        name="Round",
        venue_id="venue-1",
        shape="round",
        width_m=1.5,
        length_m=3.0,
        capacity=8,
    )
    assert created["length_m"] == created["width_m"] == 3.0


async def test_get_table_type_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_table_types.get_table_type(factory, "nonexistent")


async def test_update_table_type_partial(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_table_types.create_table_type(
        factory, "admin-1", name="Standard", venue_id="venue-1", width_m=0.7, length_m=1.8, capacity=6
    )

    updated = await mcp_table_types.update_table_type(factory, "admin-1", created["id"], capacity=8)
    assert updated["capacity"] == 8
    assert updated["name"] == "Standard"  # untouched fields survive a partial update


async def test_update_table_type_venue_reassignment(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session, "venue-1")
    await _seed_venue(db_session, "venue-2")
    created = await mcp_table_types.create_table_type(
        factory, "admin-1", name="Standard", venue_id="venue-1", width_m=0.7, length_m=1.8, capacity=6
    )

    updated = await mcp_table_types.update_table_type(factory, "admin-1", created["id"], venue_id="venue-2")
    assert updated["venue_id"] == "venue-2"


async def test_update_table_type_venue_reassignment_blocked_while_table_in_use_elsewhere(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session, "venue-1")
    await _seed_venue(db_session, "venue-2")
    created = await mcp_table_types.create_table_type(
        factory, "admin-1", name="Standard", venue_id="venue-1", width_m=0.7, length_m=1.8, capacity=6
    )

    room = Room(id="room-1", venue_id="venue-1", name="Main Hall")
    db_session.add(room)
    await db_session.flush()
    layout = Layout(id="lay-1", edition_id=None, room_id="room-1", day_id=1)
    db_session.add(layout)
    await db_session.flush()
    table = Table(id="tbl-1", name="T1", table_type_id=created["id"], layout_id="lay-1")
    db_session.add(table)
    await db_session.commit()

    with pytest.raises(ValueError, match="another venue"):
        await mcp_table_types.update_table_type(factory, "admin-1", created["id"], venue_id="venue-2")


async def test_update_table_type_venue_reassignment_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_table_types.create_table_type(
        factory, "admin-1", name="Standard", venue_id="venue-1", width_m=0.7, length_m=1.8, capacity=6
    )

    with pytest.raises(ValueError, match="not found"):
        await mcp_table_types.update_table_type(factory, "admin-1", created["id"], venue_id="nonexistent")


async def test_update_table_type_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_table_types.create_table_type(
        factory, "admin-1", name="Standard", venue_id="venue-1", width_m=0.7, length_m=1.8, capacity=6
    )

    with pytest.raises(ValueError, match="capacity"):
        await mcp_table_types.update_table_type(factory, "admin-1", created["id"], capacity=0)  # ge=1


async def test_update_table_type_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_table_types.update_table_type(factory, "admin-1", "nonexistent", capacity=8)


async def test_update_table_type_round_shape_renormalises_to_larger_dimension(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_table_types.create_table_type(
        factory,
        "admin-1",
        name="Rect",
        venue_id="venue-1",
        shape="rectangle",
        width_m=1.5,
        length_m=3.0,
        capacity=8,
    )
    assert created["shape"] == "rectangle"
    assert created["width_m"] == 1.5
    assert created["length_m"] == 3.0

    updated = await mcp_table_types.update_table_type(factory, "admin-1", created["id"], shape="round")
    assert updated["shape"] == "round"
    assert updated["length_m"] == updated["width_m"] == 3.0


async def test_update_table_type_swaps_dimensions_when_width_exceeds_length(db_session):
    """A rectangular table type's length must always be >= its width; changing a
    dimension alone (not shape) still re-derives that invariant."""
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_table_types.create_table_type(
        factory,
        "admin-1",
        name="Rect",
        venue_id="venue-1",
        shape="rectangle",
        width_m=1.0,
        length_m=2.0,
        capacity=8,
    )
    assert created["width_m"] == 1.0
    assert created["length_m"] == 2.0

    updated = await mcp_table_types.update_table_type(factory, "admin-1", created["id"], width_m=3.0)
    assert updated["length_m"] == 3.0
    assert updated["width_m"] == 2.0


async def test_delete_table_type(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_table_types.create_table_type(
        factory, "admin-1", name="Standard", venue_id="venue-1", width_m=0.7, length_m=1.8, capacity=6
    )

    result = await mcp_table_types.delete_table_type(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_table_types.get_table_type(factory, created["id"])


async def test_delete_table_type_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_table_types.delete_table_type(factory, "admin-1", "nonexistent")


async def test_delete_table_type_blocked_while_table_in_use(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_table_types.create_table_type(
        factory, "admin-1", name="Standard", venue_id="venue-1", width_m=0.7, length_m=1.8, capacity=6
    )

    room = Room(id="room-1", venue_id="venue-1", name="Main Hall")
    db_session.add(room)
    await db_session.flush()
    layout = Layout(id="lay-1", edition_id=None, room_id="room-1", day_id=1)
    db_session.add(layout)
    await db_session.flush()
    table = Table(id="tbl-1", name="T1", table_type_id=created["id"], layout_id="lay-1")
    db_session.add(table)
    await db_session.commit()

    with pytest.raises(ValueError, match="tables"):
        await mcp_table_types.delete_table_type(factory, "admin-1", created["id"])
