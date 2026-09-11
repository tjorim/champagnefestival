"""Tests for the admin (write) floor-plan layout MCP tools."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.mcp.admin import layouts as mcp_layouts
from app.models import (
    Area,
    Exhibitor,
    Person,
    Registration,
    RegistrationAllocation,
    Room,
    Table,
    TableType,
    Venue,
)
from tests.helpers import mcp_session_factory, seed_layout_event


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

    created = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )
    assert created["room_id"] == "room-1"
    assert created["event_id"] == await seed_layout_event(db_session)
    layout_id = created["id"]

    fetched = await mcp_layouts.get_layout(factory, layout_id)
    assert fetched["id"] == layout_id

    listed = await mcp_layouts.list_layouts(factory)
    assert any(lay["id"] == layout_id for lay in listed["layouts"])


async def test_list_layouts_filters_by_room_id(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session, room_id="room-1")
    db_session.add(Room(id="room-2", venue_id="venue-1", name="Second Room", width_m=25.0, length_m=18.0))
    await db_session.commit()

    created_a = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )
    await mcp_layouts.create_layout(factory, "admin-1", room_id="room-2", event_id=await seed_layout_event(db_session))

    listed = await mcp_layouts.list_layouts(factory, room_id="room-1")
    assert [lay["id"] for lay in listed["layouts"]] == [created_a["id"]]


async def test_get_layout_include_tables(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    created = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )

    db_session.add(TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6))
    await db_session.flush()
    db_session.add(Table(id="tbl-1", name="T1", table_type_id="ttype-1", layout_id=created["id"]))
    db_session.add(Area(id="area-1", layout_id=created["id"], label="Zone A"))
    await db_session.commit()

    without_tables = await mcp_layouts.get_layout(factory, created["id"])
    assert "tables" not in without_tables
    assert "areas" not in without_tables

    with_tables = await mcp_layouts.get_layout(factory, created["id"], include_tables=True)
    assert [t["id"] for t in with_tables["tables"]] == ["tbl-1"]
    assert [a["id"] for a in with_tables["areas"]] == ["area-1"]


async def test_create_layout_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)

    with pytest.raises(ValueError, match="event_id"):
        await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", event_id="")  # ge=1


async def test_create_layout_rejects_unknown_room(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.create_layout(
            factory, "admin-1", room_id="nonexistent", event_id=await seed_layout_event(db_session)
        )


async def test_create_layout_rejects_duplicate_room_day(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)

    await mcp_layouts.create_layout(factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session))
    with pytest.raises(ValueError, match="already exists"):
        await mcp_layouts.create_layout(
            factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
        )


async def test_get_layout_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.get_layout(factory, "nonexistent")


async def test_delete_layout(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    created = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )

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
    created = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )

    db_session.add(TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6))
    await db_session.flush()
    db_session.add(Table(id="tbl-1", name="T1", table_type_id="ttype-1", layout_id=created["id"]))
    await db_session.commit()

    with pytest.raises(ValueError, match="tables"):
        await mcp_layouts.delete_layout(factory, "admin-1", created["id"])


async def test_copy_layout_not_found_source(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.copy_layout(
            factory, "admin-1", "nonexistent", room_id="room-1", event_id=await seed_layout_event(db_session)
        )


async def test_copy_layout_rejects_unknown_target_room(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )

    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.copy_layout(
            factory,
            "admin-1",
            source["id"],
            room_id="nonexistent",
            event_id=await seed_layout_event(db_session, number=2),
        )


async def test_copy_layout_rejects_duplicate_room_day(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )
    await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session, number=2)
    )

    with pytest.raises(ValueError, match="already exists"):
        await mcp_layouts.copy_layout(
            factory, "admin-1", source["id"], room_id="room-1", event_id=await seed_layout_event(db_session, number=2)
        )


async def test_copy_layout_clones_tables_and_areas_with_new_ids(db_session):
    """Copying a layout that has a table inside an area and a table outside it
    clones both tables and the area under the new layout id, with fresh ids
    (matching _table_in_any_area's inside/outside classification)."""
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )

    db_session.add(TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6))
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
        id="tbl-inside", name="InArea", table_type_id="ttype-1", layout_id=source["id"], x=10.0, y=10.0
    )
    # Table far outside the area (bottom-right corner of the room).
    table_outside = Table(
        id="tbl-outside", name="Outside", table_type_id="ttype-1", layout_id=source["id"], x=90.0, y=90.0
    )
    db_session.add_all([area, table_inside, table_outside])
    await db_session.commit()

    copied = await mcp_layouts.copy_layout(
        factory,
        "admin-1",
        source["id"],
        room_id="room-1",
        event_id=await seed_layout_event(db_session, number=2),
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


async def test_copy_layout_rejects_area_with_inactive_exhibitor(db_session):
    """An area whose exhibitor was deactivated after the area was created must not
    be silently carried into the copy — create_area/update_area both refuse to
    assign an inactive exhibitor, so the copy path can't create areas those tools
    would reject."""
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )

    exhibitor = Exhibitor(name="Bollinger", type="producer", active=False)
    db_session.add(exhibitor)
    await db_session.flush()
    db_session.add(Area(id="area-1", layout_id=source["id"], label="Zone A", exhibitor_id=exhibitor.id))
    await db_session.commit()

    with pytest.raises(ValueError, match="inactive"):
        await mcp_layouts.copy_layout(
            factory,
            "admin-1",
            source["id"],
            room_id="room-1",
            event_id=await seed_layout_event(db_session, number=2),
            copy_tables=False,
            copy_areas=True,
        )


async def test_copy_layout_copy_tables_false_skips_outside_tables(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )

    db_session.add(TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6))
    await db_session.flush()
    db_session.add(
        Table(
            id="tbl-outside",
            name="Outside",
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
        event_id=await seed_layout_event(db_session, number=2),
        copy_tables=False,
        copy_areas=False,
    )
    new_layout_id = copied["id"]

    new_tables = (await db_session.execute(select(Table).where(Table.layout_id == new_layout_id))).scalars().all()
    assert new_tables == []


async def test_copy_layout_copy_areas_true_without_tables(db_session):
    """copy_tables and copy_areas are independent switches: an area outside
    any table can be copied while a table outside any area is skipped."""
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    source = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )

    db_session.add(TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6))
    await db_session.flush()
    db_session.add(
        Table(
            id="tbl-1",
            name="T1",
            table_type_id="ttype-1",
            layout_id=source["id"],
            x=90.0,
            y=90.0,
        )
    )
    db_session.add(Area(id="area-1", layout_id=source["id"], label="Zone A", x=10.0, y=10.0))
    await db_session.commit()

    copied = await mcp_layouts.copy_layout(
        factory,
        "admin-1",
        source["id"],
        room_id="room-1",
        event_id=await seed_layout_event(db_session, number=2),
        copy_tables=False,
        copy_areas=True,
    )
    new_layout_id = copied["id"]

    new_tables = (await db_session.execute(select(Table).where(Table.layout_id == new_layout_id))).scalars().all()
    assert new_tables == []
    new_areas = (await db_session.execute(select(Area).where(Area.layout_id == new_layout_id))).scalars().all()
    assert len(new_areas) == 1
    assert new_areas[0].label == "Zone A"


# ---------------------------------------------------------------------------
# Layout revisions (#1021)
# ---------------------------------------------------------------------------


async def test_save_list_get_layout_revision(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    layout = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )
    db_session.add(TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6))
    await db_session.flush()
    db_session.add(Table(id="tbl-1", name="T1", table_type_id="ttype-1", layout_id=layout["id"]))
    await db_session.commit()

    saved = await mcp_layouts.save_layout_revision(factory, "admin-1", layout["id"], label="Opening")
    assert saved["revision_number"] == 1
    assert saved["label"] == "Opening"
    assert [t["id"] for t in saved["snapshot"]["tables"]] == ["tbl-1"]

    listed = await mcp_layouts.list_layout_revisions(factory, layout["id"])
    assert [r["revision_number"] for r in listed["revisions"]] == [1]

    fetched = await mcp_layouts.get_layout_revision(factory, layout["id"], 1)
    assert fetched["id"] == saved["id"]

    with pytest.raises(ValueError, match="has no revision"):
        await mcp_layouts.get_layout_revision(factory, layout["id"], 2)


async def test_save_layout_revision_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_layouts.save_layout_revision(factory, "admin-1", "nonexistent", label="x")


async def test_compare_layout_revisions_matches_current_and_rejects_bad_ref(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    layout = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )
    db_session.add(TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6))
    await db_session.flush()
    db_session.add(Table(id="tbl-1", name="T1", table_type_id="ttype-1", layout_id=layout["id"], x=10.0))
    await db_session.commit()
    await mcp_layouts.save_layout_revision(factory, "admin-1", layout["id"], label="v1")

    table = await db_session.get(Table, "tbl-1")
    table.x = 50.0
    await db_session.commit()

    diff = await mcp_layouts.compare_layout_revisions(factory, layout["id"], "1", "current")
    assert [t["id"] for t in diff["changed_tables"]] == ["tbl-1"]
    assert {c["field"] for c in diff["changed_tables"][0]["changes"]} == {"x"}

    with pytest.raises(ValueError, match="Invalid revision reference"):
        await mcp_layouts.compare_layout_revisions(factory, layout["id"], "nope", "current")


async def test_preview_and_restore_layout_revision(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    layout = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )
    db_session.add(TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6))
    await db_session.flush()
    db_session.add(Table(id="tbl-1", name="T1", table_type_id="ttype-1", layout_id=layout["id"], x=10.0))
    await db_session.commit()
    await mcp_layouts.save_layout_revision(factory, "admin-1", layout["id"], label="v1")

    table = await db_session.get(Table, "tbl-1")
    table.x = 90.0
    await db_session.commit()

    preview = await mcp_layouts.preview_layout_restore(factory, layout["id"], 1)
    assert preview["has_conflicts"] is False
    assert [t["id"] for t in preview["tables_to_update"]] == ["tbl-1"]

    with pytest.raises(ValueError, match="has no revision"):
        await mcp_layouts.preview_layout_restore(factory, layout["id"], 99)

    restored = await mcp_layouts.restore_layout_revision(factory, "admin-1", layout["id"], 1)
    restored_table = next(t for t in restored["tables"] if t["id"] == "tbl-1")
    assert restored_table["x"] == 10.0


async def test_restore_layout_revision_blocked_by_conflict_then_resolved(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_room(db_session)
    layout = await mcp_layouts.create_layout(
        factory, "admin-1", room_id="room-1", event_id=await seed_layout_event(db_session)
    )
    await mcp_layouts.save_layout_revision(factory, "admin-1", layout["id"], label="empty")

    db_session.add(TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6))
    await db_session.flush()
    db_session.add(Table(id="tbl-1", name="T1", table_type_id="ttype-1", layout_id=layout["id"]))
    db_session.add(Person(id="person-1", name="Alice"))
    await db_session.flush()
    db_session.add(
        Registration(
            id="reg-1", event_id=layout["event_id"], person_id="person-1", guest_count=2, check_in_token="tok-1"
        )
    )
    await db_session.flush()
    db_session.add(RegistrationAllocation(registration_id="reg-1", table_id="tbl-1", guest_count=2))
    await db_session.commit()

    preview = await mcp_layouts.preview_layout_restore(factory, layout["id"], 1)
    assert preview["has_conflicts"] is True
    assert preview["allocation_conflicts"][0]["registration_ids"] == ["reg-1"]
    assert preview["allocation_conflicts"][0]["reason"] == "deleted"

    with pytest.raises(ValueError, match="live allocations"):
        await mcp_layouts.restore_layout_revision(factory, "admin-1", layout["id"], 1)

    restored = await mcp_layouts.restore_layout_revision(factory, "admin-1", layout["id"], 1, resolve_allocations=True)
    assert restored["tables"] == []

    remaining_allocations = (
        (await db_session.execute(select(RegistrationAllocation).where(RegistrationAllocation.table_id == "tbl-1")))
        .scalars()
        .all()
    )
    assert remaining_allocations == []
    assert await db_session.get(Registration, "reg-1") is not None
