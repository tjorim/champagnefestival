"""Tests for the admin MCP tools for the sold-out waitlist queue."""

from __future__ import annotations

import pytest

from app.mcp.admin import waitlist as mcp_waitlist
from app.models import WaitlistEntry
from tests.helpers import ADMIN_HEADERS, _create_event, mcp_session_factory


async def _entry(client, db_session, *, entry_id: str, event_id: str, product_id: str | None = None) -> str:
    if product_id is None:
        response = await client.post(
            "/api/products",
            json={
                "event_id": event_id,
                "name_nl": "Champagneontbijt",
                "price": "0",
                "category": "other",
                "unit": "person",
                "stock": 0,
            },
            headers=ADMIN_HEADERS,
        )
        assert response.status_code == 201, response.text
        product_id = response.json()["id"]
    db_session.add(
        WaitlistEntry(
            id=entry_id, product_id=product_id, name="Nancy", email="nancy@example.com", client_ip="203.0.113.1"
        )
    )
    await db_session.commit()
    return product_id


async def test_list_filters_and_marks_entries_handled(client, db_session):
    event = await _create_event(client)
    product_id = await _entry(client, db_session, entry_id="wl-1", event_id=event["id"])
    factory = mcp_session_factory(db_session)

    listed = await mcp_waitlist.list_waitlist_entries(factory, event_id=event["id"])
    assert [entry["id"] for entry in listed["entries"]] == ["wl-1"]
    assert listed["entries"][0]["product_name"] == "Champagneontbijt"
    assert listed["entries"][0]["event_title"] == event["title"]
    assert (await mcp_waitlist.list_waitlist_entries(factory, product_id=product_id))["entries"][0]["id"] == "wl-1"
    assert (await mcp_waitlist.list_waitlist_entries(factory, product_id="other"))["entries"] == []

    handled = await mcp_waitlist.mark_waitlist_entry_handled(factory, "wl-1")
    assert handled["handled_at"] is not None
    again = await mcp_waitlist.mark_waitlist_entry_handled(factory, "wl-1")
    assert again["handled_at"] == handled["handled_at"]


async def test_delete_entry_and_unknown_entries(client, db_session):
    event = await _create_event(client)
    await _entry(client, db_session, entry_id="wl-1", event_id=event["id"])
    factory = mcp_session_factory(db_session)

    assert await mcp_waitlist.delete_waitlist_entry(factory, "wl-1") == {"deleted": True, "id": "wl-1"}
    assert (await mcp_waitlist.list_waitlist_entries(factory))["entries"] == []
    with pytest.raises(ValueError, match="not found"):
        await mcp_waitlist.delete_waitlist_entry(factory, "wl-1")
    with pytest.raises(ValueError, match="not found"):
        await mcp_waitlist.mark_waitlist_entry_handled(factory, "wl-1")
