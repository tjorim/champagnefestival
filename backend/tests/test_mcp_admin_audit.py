"""Tests for the admin (read) audit trail MCP tools."""

from __future__ import annotations

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


async def test_list_audit_resource_types(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_venues.create_venue(factory, "admin-1", name="Test Venue")

    listed = await mcp_audit.list_audit_resource_types(factory)
    assert "venue" in listed["resource_types"]
