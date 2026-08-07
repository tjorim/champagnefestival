"""Tests for the admin (write) venue MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import venues as mcp_venues
from app.models import Edition, Room
from tests.helpers import mcp_session_factory


async def test_create_get_list_venue(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_venues.create_venue(factory, "admin-1", name="Test Venue", city="Bredene")
    assert created["name"] == "Test Venue"
    assert created["city"] == "Bredene"
    venue_id = created["id"]

    fetched = await mcp_venues.get_venue(factory, venue_id)
    assert fetched["id"] == venue_id

    listed = await mcp_venues.list_venues(factory)
    assert any(v["id"] == venue_id for v in listed["venues"])


async def test_create_venue_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="name"):
        await mcp_venues.create_venue(factory, "admin-1", name="")  # min_length=1


async def test_get_venue_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_venues.get_venue(factory, "nonexistent")


async def test_update_venue_partial(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")

    updated = await mcp_venues.update_venue(factory, "admin-1", created["id"], city="Oostende")
    assert updated["city"] == "Oostende"
    assert updated["name"] == "Test Venue"  # untouched fields survive a partial update


async def test_update_venue_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_venues.update_venue(factory, "admin-1", "nonexistent", city="Oostende")


async def test_delete_venue(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")

    result = await mcp_venues.delete_venue(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_venues.get_venue(factory, created["id"])


async def test_delete_venue_blocked_while_edition_in_use(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")

    db_session.add(Edition(id="edition-1", year=2099, month="march", venue_id=created["id"]))
    await db_session.commit()

    with pytest.raises(ValueError, match="editions"):
        await mcp_venues.delete_venue(factory, "admin-1", created["id"])


async def test_delete_venue_blocked_while_room_in_use(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")

    db_session.add(Room(id="room-1", venue_id=created["id"], name="Main Hall"))
    await db_session.commit()

    with pytest.raises(ValueError, match="rooms"):
        await mcp_venues.delete_venue(factory, "admin-1", created["id"])
