"""Integration tests for GET /api/venue-plan/{edition_id}."""

from __future__ import annotations

import pytest

from tests.helpers import _post_registration

ADMIN_HEADERS = {"Authorization": "Bearer admin-token"}

VENUE_PAYLOAD = {
    "name": "Test Hall",
    "address": "1 Main St",
    "city": "Brussels",
    "postal_code": "1000",
    "country": "Belgium",
    "lat": 50.85,
    "lng": 4.35,
}
ROOM_PAYLOAD = {
    "name": "Room A",
    "width_m": 20.0,
    "length_m": 15.0,
}


async def _setup_edition_with_layout(client) -> tuple[str, str, str]:
    """Create a venue, room, edition, event, and layout. Returns (edition_id, layout_id, room_id)."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    venue_id = r.json()["id"]

    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    room_id = r.json()["id"]

    edition_payload = {
        "id": "vp-2026",
        "year": 2026,
        "month": "march",
        "venue_id": venue_id,
        "edition_type": "festival",
        "active": True,
    }
    r = await client.post("/api/editions", json=edition_payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201

    event_payload = {
        "edition_id": "vp-2026",
        "title": "Friday",
        "description": "",
        "date": "2026-03-13",
        "start_time": "19:00",
        "end_time": "22:00",
        "category": "festival",
        "registration_required": True,
        "active": True,
    }
    r = await client.post("/api/events", json=event_payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201

    layout_payload = {"room_id": room_id, "edition_id": "vp-2026", "day_id": 1}
    r = await client.post("/api/layouts", json=layout_payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    layout_id = r.json()["id"]

    return "vp-2026", layout_id, room_id


@pytest.mark.anyio
async def test_venue_plan_admin_can_access(client):
    edition_id, _, _ = await _setup_edition_with_layout(client)
    r = await client.get(f"/api/venue-plan/{edition_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert data["edition_id"] == edition_id
    assert len(data["layouts"]) == 1
    layout = data["layouts"][0]
    assert layout["day_id"] == 1
    assert layout["room"] is not None
    assert layout["tables"] == []
    assert layout["areas"] == []


@pytest.mark.anyio
async def test_venue_plan_volunteer_can_access(volunteer_client):
    """Volunteer role should be accepted for the venue-plan endpoint."""
    r = await volunteer_client.get("/api/venue-plan/nonexistent-edition")
    assert r.status_code == 404  # Not 401 or 403 — auth passed


@pytest.mark.anyio
async def test_venue_plan_returns_404_for_missing_edition(client):
    r = await client.get("/api/venue-plan/does-not-exist", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_venue_plan_empty_layouts_when_none(client):
    """Edition with no layouts returns an empty layouts list."""
    r = await client.post(
        "/api/venues",
        json={**VENUE_PAYLOAD, "name": "Empty venue"},
        headers=ADMIN_HEADERS,
    )
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/editions",
        json={"id": "vp-empty", "year": 2025, "month": "june", "venue_id": venue_id, "edition_type": "festival"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.get("/api/venue-plan/vp-empty", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert data["layouts"] == []


@pytest.mark.anyio
async def test_venue_plan_returns_non_cancelled_guest_occupancy(client):
    edition_id, layout_id, room_id = await _setup_edition_with_layout(client)
    events = (await client.get("/api/events", headers=ADMIN_HEADERS)).json()
    event = next(item for item in events if item["edition_id"] == edition_id)
    rooms = (await client.get("/api/rooms", headers=ADMIN_HEADERS)).json()
    venue_id = next(item["venue_id"] for item in rooms if item["id"] == room_id)
    table_type = await client.post(
        "/api/table-types",
        json={"name": "Standard", "venue_id": venue_id, "capacity": 6, "width_m": 0.7, "length_m": 1.8},
        headers=ADMIN_HEADERS,
    )
    table = await client.post(
        "/api/tables",
        json={"name": "A1", "table_type_id": table_type.json()["id"], "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    registration = await _post_registration(client, event=event, guest_count=3)
    registration_id = registration.json()["id"]
    assigned = await client.put(
        f"/api/registrations/{registration_id}", json={"table_id": table.json()["id"]}, headers=ADMIN_HEADERS
    )
    assert assigned.status_code == 200

    response = await client.get(f"/api/venue-plan/{edition_id}", headers=ADMIN_HEADERS)
    payload = response.json()["layouts"][0]["tables"][0]
    assert payload["registration_ids"] == [registration_id]
    assert payload["occupied_seats"] == 3

    await client.put(f"/api/registrations/{registration_id}", json={"status": "cancelled"}, headers=ADMIN_HEADERS)
    response = await client.get(f"/api/venue-plan/{edition_id}", headers=ADMIN_HEADERS)
    payload = response.json()["layouts"][0]["tables"][0]
    assert payload["registration_ids"] == []
    assert payload["occupied_seats"] == 0
