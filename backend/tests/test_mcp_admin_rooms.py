"""Tests for the admin (write) room MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import rooms as mcp_rooms
from app.models import Layout, Venue
from tests.helpers import mcp_session_factory


async def _seed_venue(db_session, venue_id: str = "venue-1") -> Venue:
    venue = Venue(id=venue_id, name="Test Venue")
    db_session.add(venue)
    await db_session.commit()
    return venue


async def test_create_get_list_room(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    created = await mcp_rooms.create_room(factory, "admin-1", name="Main Hall", venue_id="venue-1")
    assert created["name"] == "Main Hall"
    assert created["venue_id"] == "venue-1"
    room_id = created["id"]

    fetched = await mcp_rooms.get_room(factory, room_id)
    assert fetched["id"] == room_id

    listed = await mcp_rooms.list_rooms(factory)
    assert any(r["id"] == room_id for r in listed["rooms"])


async def test_create_room_venue_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_rooms.create_room(factory, "admin-1", name="Main Hall", venue_id="nonexistent")


async def test_create_room_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)

    with pytest.raises(ValueError, match="color"):
        await mcp_rooms.create_room(factory, "admin-1", name="Main Hall", venue_id="venue-1", color="not-a-color")


async def test_get_room_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_rooms.get_room(factory, "nonexistent")


async def test_update_room_partial(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_rooms.create_room(factory, "admin-1", name="Main Hall", venue_id="venue-1")

    updated = await mcp_rooms.update_room(factory, "admin-1", created["id"], length_m=20.0)
    assert updated["length_m"] == 20.0
    assert updated["name"] == "Main Hall"  # untouched fields survive a partial update
    assert updated["width_m"] == created["width_m"]


async def test_update_room_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_rooms.create_room(factory, "admin-1", name="Main Hall", venue_id="venue-1")

    with pytest.raises(ValueError, match="width_m"):
        await mcp_rooms.update_room(factory, "admin-1", created["id"], width_m=1000.0)  # le=500


async def test_update_room_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_rooms.update_room(factory, "admin-1", "nonexistent", length_m=20.0)


async def test_delete_room(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_rooms.create_room(factory, "admin-1", name="Main Hall", venue_id="venue-1")

    result = await mcp_rooms.delete_room(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_rooms.get_room(factory, created["id"])


async def test_delete_room_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_rooms.delete_room(factory, "admin-1", "nonexistent")


async def test_delete_room_blocked_while_layout_in_use(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_venue(db_session)
    created = await mcp_rooms.create_room(factory, "admin-1", name="Main Hall", venue_id="venue-1")

    db_session.add(Layout(id="lay-1", edition_id=None, room_id=created["id"], day_id=1))
    await db_session.commit()

    with pytest.raises(ValueError, match="layouts"):
        await mcp_rooms.delete_room(factory, "admin-1", created["id"])
