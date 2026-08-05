"""Tests for the events API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event


@pytest.mark.anyio
async def test_list_events_requires_auth(unauth_client):
    response = await unauth_client.get("/api/events")
    assert response.status_code == 401


async def _register(client, event, *, guest_count, person_name):
    r = await client.post("/api/people", json={"name": person_name}, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    person_id = r.json()["id"]
    r = await client.post(
        "/api/registrations/admin",
        json={"person_id": person_id, "event_id": event["id"], "guest_count": guest_count},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.anyio
async def test_checkin_stats_counts_guests_not_bookings(client):
    """total/checked_in are guest headcounts (sum of guest_count), matching the
    admin's own capacity panel — not a count of bookings."""
    event = await _create_event(client)

    reg_a = await _register(client, event, guest_count=3, person_name="Alice")
    await _register(client, event, guest_count=2, person_name="Bob")

    r = await client.put(f"/api/registrations/{reg_a}", json={"checked_in": True}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text

    r = await client.get("/api/events/checkin-stats", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    stats = {row["event_id"]: row for row in r.json()}

    assert stats[event["id"]]["total"] == 5
    assert stats[event["id"]]["checked_in"] == 3


@pytest.mark.anyio
async def test_checkin_stats_excludes_cancelled_registrations(client):
    event = await _create_event(client)
    reg_id = await _register(client, event, guest_count=4, person_name="Cancelled Guest")

    r = await client.put(f"/api/registrations/{reg_id}", json={"status": "cancelled"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text

    r = await client.get("/api/events/checkin-stats", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    stats = {row["event_id"]: row for row in r.json()}

    assert event["id"] not in stats


@pytest.mark.anyio
async def test_checkin_stats_filters_by_edition(client):
    event_a = await _create_event(client, edition_id="edition-checkin-a", title="Event A")
    event_b = await _create_event(client, edition_id="edition-checkin-b", title="Event B")
    await _register(client, event_a, guest_count=1, person_name="Guest A")
    await _register(client, event_b, guest_count=1, person_name="Guest B")

    r = await client.get("/api/events/checkin-stats", params={"edition_id": "edition-checkin-a"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    stats = {row["event_id"]: row for row in r.json()}

    assert event_a["id"] in stats
    assert event_b["id"] not in stats
