"""Tests for the admin (write) volunteer meal/dinner poll option MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import poll_options as mcp_poll_options
from app.models import Edition, Venue
from tests.helpers import mcp_session_factory


async def _create_edition(db_session, *, edition_id: str = "edition-1") -> str:
    venue = Venue(id=f"venue-{edition_id}", name="Test Venue")
    db_session.add(venue)
    await db_session.flush()
    edition = Edition(id=edition_id, year=2099, month="march", venue_id=venue.id, active=False)
    db_session.add(edition)
    await db_session.commit()
    return edition.id


async def test_create_list_update_delete_poll_option(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)

    created = await mcp_poll_options.create_poll_option(
        factory, "admin-1", edition_id=edition_id, kind="dish", label="Vol-au-vent met puree"
    )
    assert created["edition_id"] == edition_id
    assert created["kind"] == "dish"
    assert created["label"] == "Vol-au-vent met puree"

    listed = await mcp_poll_options.list_poll_options(factory, edition_id)
    assert [o["id"] for o in listed] == [created["id"]]

    updated = await mcp_poll_options.update_poll_option(factory, "admin-1", created["id"], label="Stoofvlees")
    assert updated["label"] == "Stoofvlees"

    result = await mcp_poll_options.delete_poll_option(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    assert await mcp_poll_options.list_poll_options(factory, edition_id) == []


async def test_create_poll_option_rejects_missing_edition(db_session):
    factory = mcp_session_factory(db_session)

    with pytest.raises(ValueError, match="not found"):
        await mcp_poll_options.create_poll_option(
            factory, "admin-1", edition_id="nonexistent", kind="dish", label="Whatever"
        )


async def test_list_poll_options_filters_by_edition(db_session):
    factory = mcp_session_factory(db_session)
    edition_a = await _create_edition(db_session, edition_id="edition-a")
    edition_b = await _create_edition(db_session, edition_id="edition-b")

    await mcp_poll_options.create_poll_option(factory, "admin-1", edition_id=edition_a, kind="soup", label="A Soup")
    await mcp_poll_options.create_poll_option(factory, "admin-1", edition_id=edition_b, kind="soup", label="B Soup")

    all_options = await mcp_poll_options.list_poll_options(factory)
    assert len(all_options) == 2

    a_options = await mcp_poll_options.list_poll_options(factory, edition_a)
    assert [o["label"] for o in a_options] == ["A Soup"]


async def test_update_poll_option_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_poll_options.update_poll_option(factory, "admin-1", "nonexistent", label="New Label")


async def test_delete_poll_option_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_poll_options.delete_poll_option(factory, "admin-1", "nonexistent")
