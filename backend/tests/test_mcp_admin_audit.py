"""Tests for the admin (read) audit trail MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import audit as mcp_audit
from app.mcp.admin import venues as mcp_venues
from tests.helpers import mcp_session_factory


async def test_list_audit_entries_records_mutations(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")
    await mcp_venues.update_venue(factory, "admin-1", created["id"], city="Oostende")

    listed = await mcp_audit.list_audit_entries(factory, resource_type="venue", resource_id=created["id"])
    actions = [e["action"] for e in listed["entries"]]
    assert "venue_created" in actions
    assert "venue_updated" in actions
    assert all(e["actor"] == "admin-1" for e in listed["entries"])


async def test_list_audit_entries_filters_by_action(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")

    listed = await mcp_audit.list_audit_entries(factory, action="venue_created")
    assert any(e["resource_id"] == created["id"] for e in listed["entries"])

    listed = await mcp_audit.list_audit_entries(factory, action="venue_deleted")
    assert not any(e["resource_id"] == created["id"] for e in listed["entries"])


async def test_list_audit_entries_respects_limit(db_session):
    factory = mcp_session_factory(db_session)
    for i in range(3):
        await mcp_venues.create_venue(factory, "admin-1", name=f"Venue {i}")

    listed = await mcp_audit.list_audit_entries(factory, limit=2)
    assert len(listed["entries"]) == 2


async def test_list_audit_entries_default_limit_is_capped(db_session):
    factory = mcp_session_factory(db_session)
    for i in range(3):
        await mcp_venues.create_venue(factory, "admin-1", name=f"Venue {i}")

    listed = await mcp_audit.list_audit_entries(factory, limit=None)
    assert len(listed["entries"]) == 3  # under DEFAULT_AUDIT_LIMIT, so nothing trimmed
    assert len(listed["entries"]) <= mcp_audit.DEFAULT_AUDIT_LIMIT


async def test_list_audit_entries_limit_is_capped_at_max(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")

    listed = await mcp_audit.list_audit_entries(factory, limit=mcp_audit.MAX_AUDIT_LIMIT + 500)
    assert len(listed["entries"]) == 1  # would fail if the oversized limit reached the DB uncapped


async def test_list_audit_entries_rejects_negative_offset(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="offset"):
        await mcp_audit.list_audit_entries(factory, offset=-1)


async def test_list_audit_entries_paginates_with_offset(db_session):
    factory = mcp_session_factory(db_session)
    for i in range(3):
        await mcp_venues.create_venue(factory, "admin-1", name=f"Venue {i}")

    page1 = await mcp_audit.list_audit_entries(factory, limit=2, offset=0)
    page2 = await mcp_audit.list_audit_entries(factory, limit=2, offset=2)
    assert len(page1["entries"]) == 2
    assert len(page2["entries"]) == 1
    assert {e["id"] for e in page1["entries"]}.isdisjoint({e["id"] for e in page2["entries"]})


async def test_list_audit_entries_filters_by_since_and_until(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")

    # Naive (no-timezone) ISO date, matching how a caller would pass a bare date.
    past = await mcp_audit.list_audit_entries(factory, since="2020-01-01", resource_id=created["id"])
    assert any(e["resource_id"] == created["id"] for e in past["entries"])

    future = await mcp_audit.list_audit_entries(factory, since="2099-01-01", resource_id=created["id"])
    assert not any(e["resource_id"] == created["id"] for e in future["entries"])

    until_past = await mcp_audit.list_audit_entries(factory, until="2020-01-01", resource_id=created["id"])
    assert not any(e["resource_id"] == created["id"] for e in until_past["entries"])


async def test_list_audit_resource_types(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")

    listed = await mcp_audit.list_audit_resource_types(factory)
    assert "venue" in listed["resource_types"]
