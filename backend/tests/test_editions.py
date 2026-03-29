"""Tests for the editions API (public active endpoint and admin edition management)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD, _create_event


@pytest.mark.anyio
async def test_active_edition_not_found(client):
    r = await client.get("/api/editions/active")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_active_edition_returns_404_when_only_past_editions_exist(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-past-only",
            "year": 2020,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    event_response = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-past-only",
            "title": "Past Event",
            "description": "",
            "date": "2020-03-20",
            "start_time": "18:00",
            "end_time": "22:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert event_response.status_code == 201

    response = await client.get("/api/editions/active")

    assert response.status_code == 404
    assert response.json()["detail"] == "No active or upcoming editions found."


@pytest.mark.anyio
async def test_active_edition_returns_embedded_venue_and_exhibitors(client):
    # Create venue
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]

    # Create a producer and a sponsor
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Bollinger", "type": "producer"},
        headers=ADMIN_HEADERS,
    )
    producer_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Acme", "type": "sponsor"},
        headers=ADMIN_HEADERS,
    )
    sponsor_id = r.json()["id"]

    # Create active edition
    r = await client.post(
        "/api/editions",
        json={
            "id": "2026",
            "year": 2026,
            "month": "march",
            "venue_id": venue_id,
            "exhibitors": [producer_id, sponsor_id],
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    # Add a far-future event so the edition is considered "upcoming" by the active endpoint
    r = await client.post(
        "/api/events",
        json={
            "edition_id": "2026",
            "title": "Sunday",
            "description": "",
            "date": "2099-03-22",
            "start_time": "14:00",
            "end_time": "18:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    # Public endpoint — no auth required
    r = await client.get("/api/editions/active")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "2026"
    assert data["dates"] == ["2099-03-22"]
    assert data["venue"]["name"] == "Test Venue"
    assert len(data["producers"]) == 1
    assert data["producers"][0]["name"] == "Bollinger"
    assert len(data["sponsors"]) == 1
    assert data["sponsors"][0]["name"] == "Acme"


@pytest.mark.anyio
async def test_active_edition_includes_dates_derived_from_events(client):
    event = await _create_event(client, edition_id="edition-with-dates")

    r = await client.get("/api/editions/active")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "edition-with-dates"
    assert data["dates"] == [event["date"]]


@pytest.mark.anyio
async def test_active_edition_dates_are_unique_when_multiple_events_share_a_day(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-multi-day",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    for payload in [
        {
            "edition_id": "edition-multi-day",
            "title": "Friday Tasting",
            "description": "",
            "date": "2099-03-21",
            "start_time": "17:00",
            "end_time": "18:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
        {
            "edition_id": "edition-multi-day",
            "title": "Friday VIP",
            "description": "",
            "date": "2099-03-21",
            "start_time": "19:00",
            "end_time": "20:00",
            "category": "festival",
            "registration_required": True,
            "active": True,
        },
        {
            "edition_id": "edition-multi-day",
            "title": "Saturday Party",
            "description": "",
            "date": "2099-03-22",
            "start_time": "20:00",
            "end_time": "22:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
    ]:
        event_response = await client.post("/api/events", json=payload, headers=ADMIN_HEADERS)
        assert event_response.status_code == 201

    r = await client.get("/api/editions/active")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "edition-multi-day"
    assert data["dates"] == ["2099-03-21", "2099-03-22"]
    assert [event["title"] for event in data["events"]] == [
        "Friday Tasting",
        "Friday VIP",
        "Saturday Party",
    ]


@pytest.mark.anyio
async def test_standalone_event_can_move_within_same_single_day(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-bourse-single-day",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    event_response = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-bourse-single-day",
            "title": "Bourse Opening",
            "description": "",
            "date": "2099-03-21",
            "start_time": "10:00",
            "end_time": "11:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert event_response.status_code == 201
    event_id = event_response.json()["id"]

    update_response = await client.put(
        f"/api/events/{event_id}",
        json={"date": "2099-03-21", "title": "Bourse Opening Updated"},
        headers=ADMIN_HEADERS,
    )

    assert update_response.status_code == 200
    assert update_response.json()["date"] == "2099-03-21"


@pytest.mark.anyio
async def test_edition_rejects_vendor_exhibitors(client):
    """Vendor-type exhibitors must not be linked to editions."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Food Vendor", "type": "vendor"},
        headers=ADMIN_HEADERS,
    )
    vendor_id = r.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "2026v",
            "year": 2026,
            "month": "march",
            "friday": "2026-03-20",
            "saturday": "2026-03-21",
            "sunday": "2026-03-22",
            "venue_id": venue_id,
            "exhibitors": [vendor_id],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400
    assert "vendor" in r.json()["detail"].lower()
