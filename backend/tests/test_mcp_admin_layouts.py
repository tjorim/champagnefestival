"""Tests for the admin (write) floor-plan layout MCP tools."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.mcp.admin import layouts as mcp_layouts
from app.models import Area, Room, Table, TableType, Venue
from tests.helpers import mcp_session_factory


async def _seed_room(db_session, *, room_id: str = "room-1") -> None:
    venue = Venue(id="venue-1", name="Test Venue")
    db_session.add(venue)
    await db_session.flush()
    room = Room(id=room_id, venue_id="venue-1", name="Main Hall", width_m=25.0, length_m=18.0)
    db_session.add(room)
    await db_session.commit()


async def test_create_get_list_layout(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)

    created = await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=1)
    assert created["room_id"] == "room-1"
    assert created["day_id"] == 1
    layout_id = created["id"]

    fetched = await mcp_layouts.get_layout(factory, layout_id)
    assert fetched["id"] == layout_id

    listed = await mcp_layouts.list_layouts(factory)
    assert any(lay["id"] == layout_id for lay in listed["layouts"])


async def test_create_layout_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)

    with pytest.raises(ValueError, match="day_id"):
        await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=0)  # ge=1


async def test_create_layout_rejects_unknown_room(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.create_layout(factory, "admin-1", room_id="nonexistent", day_id=1)


async def test_create_layout_rejects_duplicate_room_day(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)

    await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=1)
    with pytest.raises(ValueError, match="already exists"):
        await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=1)


async def test_get_layout_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.get_layout(factory, "nonexistent")


async def test_delete_layout(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    created = await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=1)

    result = await mcp_layouts.delete_layout(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.get_layout(factory, created["id"])


async def test_delete_layout_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.delete_layout(factory, "admin-1", "nonexistent")


async def test_delete_layout_blocked_while_table_in_use(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    created = await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=1)

    db_session.add(TableType(id="ttype-1", name="Standard", max_capacity=6))
    await db_session.flush()
    db_session.add(Table(id="tbl-1", name="T1", capacity=6, table_type_id="ttype-1", layout_id=created["id"]))
    await db_session.commit()

    with pytest.raises(ValueError, match="tables"):
        await mcp_layouts.delete_layout(factory, "admin-1", created["id"])


async def test_copy_layout_not_found_source(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.copy_layout(factory, "admin-1", "nonexistent", room_id="room-1", day_id=1)


async def test_copy_layout_rejects_unknown_target_room(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=1)

    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.copy_layout(factory, "admin-1", source["id"], room_id="nonexistent", day_id=2)


async def test_copy_layout_rejects_duplicate_room_day(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=1)
    await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=2)

    with pytest.raises(ValueError, match="already exists"):
        await mcp_layouts.copy_layout(factory, "admin-1", source["id"], room_id="room-1", day_id=2)


async def test_copy_layout_clones_tables_and_areas_with_new_ids(db_session):
    """Copying a layout that has a table inside an area and a table outside it
    clones both tables and the area under the new layout id, with fresh ids
    (matching _table_in_any_area's inside/outside classification)."""
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=1)

    db_session.add(TableType(id="ttype-1", name="Standard", max_capacity=6))
    await db_session.flush()

    # Area covering the top-left of the 25m x 18m room.
    area = Area(
        id="area-1",
        layout_id=source["id"],
        label="Zone A",
        width_m=10.0,
        length_m=10.0,
        x=0.0,
        y=0.0,
    )
    # Table inside the area (x=10%, y=10% of a 25m x 18m room -> inside the 10m x 10m area).
    table_inside = Table(
        id="tbl-inside", name="InArea", capacity=4, table_type_id="ttype-1", layout_id=source["id"], x=10.0, y=10.0
    )
    # Table far outside the area (bottom-right corner of the room).
    table_outside = Table(
        id="tbl-outside", name="Outside", capacity=4, table_type_id="ttype-1", layout_id=source["id"], x=90.0, y=90.0
    )
    db_session.add_all([area, table_inside, table_outside])
    await db_session.commit()

    copied = await mcp_layouts.copy_layout(
        factory,
        "admin-1",
        source["id"],
        room_id="room-1",
        day_id=2,
        copy_tables=True,
        copy_areas=True,
    )
    new_layout_id = copied["id"]
    assert new_layout_id != source["id"]

    new_areas = (await db_session.execute(select(Area).where(Area.layout_id == new_layout_id))).scalars().all()
    assert len(new_areas) == 1
    assert new_areas[0].id != "area-1"
    assert new_areas[0].label == "Zone A"

    new_tables_list = (await db_session.execute(select(Table).where(Table.layout_id == new_layout_id))).scalars().all()
    new_tables = {row.name: row for row in new_tables_list}
    assert set(new_tables) == {"InArea", "Outside"}
    assert new_tables["InArea"].id != "tbl-inside"
    assert new_tables["Outside"].id != "tbl-outside"


async def test_copy_layout_copy_tables_false_skips_outside_tables(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", day_id=1)

    db_session.add(TableType(id="ttype-1", name="Standard", max_capacity=6))
    await db_session.flush()
    db_session.add(
        Table(
            id="tbl-outside",
            name="Outside",
            capacity=4,
            table_type_id="ttype-1",
            layout_id=source["id"],
            x=90.0,
            y=90.0,
        )
    )
    await db_session.commit()

    copied = await mcp_layouts.copy_layout(
        factory,
        "admin-1",
        source["id"],
        room_id="room-1",
        day_id=2,
        copy_tables=False,
        copy_areas=False,
    )
    new_layout_id = copied["id"]

    new_tables = (await db_session.execute(select(Table).where(Table.layout_id == new_layout_id))).scalars().all()
    assert new_tables == []
