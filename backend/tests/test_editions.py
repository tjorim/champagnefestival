"""Tests for the editions API (public active endpoint and admin edition management)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD, _create_event, _post_registration


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
async def test_community_edition_upcoming_lists_every_active_event_in_time_order(client):
    """Community editions may hold multiple same-day events; the public payload lists every

    active one in date/time order, and excludes inactive (draft/cancelled) events entirely.
    """
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-bourse-multi-event",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    # Created out of chronological order to prove ordering is by time, not insertion order.
    for payload in [
        {
            "edition_id": "edition-bourse-multi-event",
            "title": "Bourse Auction",
            "description": "",
            "date": "2099-03-21",
            "start_time": "15:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        {
            "edition_id": "edition-bourse-multi-event",
            "title": "Bourse Opening",
            "description": "",
            "date": "2099-03-21",
            "start_time": "10:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        {
            "edition_id": "edition-bourse-multi-event",
            "title": "Draft Tasting",
            "description": "",
            "date": "2099-03-21",
            "start_time": "12:00",
            "category": "exchange",
            "registration_required": False,
            "active": False,
        },
    ]:
        event_response = await client.post("/api/events", json=payload, headers=ADMIN_HEADERS)
        assert event_response.status_code == 201

    r = await client.get("/api/editions/upcoming", params={"edition_type": "bourse"})
    assert r.status_code == 200
    edition = next(e for e in r.json() if e["id"] == "edition-bourse-multi-event")
    assert [event["title"] for event in edition["events"]] == [
        "Bourse Opening",
        "Bourse Auction",
    ]


@pytest.mark.anyio
async def test_inactive_event_does_not_keep_finished_edition_upcoming(client):
    """An edition whose only future event is inactive must not be reported as active/upcoming."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-only-inactive-future",
            "year": 2099,
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
            "edition_id": "edition-only-inactive-future",
            "title": "Draft Sunday",
            "description": "",
            "date": "2099-03-22",
            "start_time": "14:00",
            "category": "festival",
            "registration_required": False,
            "active": False,
        },
        headers=ADMIN_HEADERS,
    )
    assert event_response.status_code == 201

    active_response = await client.get("/api/editions/active")
    assert active_response.status_code == 404

    upcoming_response = await client.get("/api/editions/upcoming")
    assert upcoming_response.status_code == 200
    assert all(edition["id"] != "edition-only-inactive-future" for edition in upcoming_response.json())


@pytest.mark.anyio
async def test_inactive_events_excluded_from_active_edition_response(client):
    """A mix of active and inactive events on the same edition: only the active one is returned."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-mixed-active",
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
            "edition_id": "edition-mixed-active",
            "title": "Draft Preview",
            "description": "",
            "date": "2099-03-20",
            "start_time": "10:00",
            "category": "festival",
            "registration_required": False,
            "active": False,
        },
        {
            "edition_id": "edition-mixed-active",
            "title": "Published Gala",
            "description": "",
            "date": "2099-03-21",
            "start_time": "18:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
    ]:
        event_response = await client.post("/api/events", json=payload, headers=ADMIN_HEADERS)
        assert event_response.status_code == 201

    active_response = await client.get("/api/editions/active")
    assert active_response.status_code == 200
    data = active_response.json()
    assert data["id"] == "edition-mixed-active"
    assert [event["title"] for event in data["events"]] == ["Published Gala"]
    assert data["dates"] == ["2099-03-21"]

    admin_response = await client.get(f"/api/editions/{data['id']}", headers=ADMIN_HEADERS)
    assert admin_response.status_code == 200
    admin_data = admin_response.json()
    assert [event["title"] for event in admin_data["events"]] == ["Draft Preview", "Published Gala"]
    assert admin_data["dates"] == ["2099-03-20", "2099-03-21"]


@pytest.mark.anyio
async def test_standalone_event_rejects_a_second_date(client):
    """Community editions may only span a single calendar date."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-bourse-two-dates",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    first_event = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-bourse-two-dates",
            "title": "Bourse Opening",
            "description": "",
            "date": "2099-03-21",
            "start_time": "10:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert first_event.status_code == 201

    second_event = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-bourse-two-dates",
            "title": "Bourse Auction",
            "description": "",
            "date": "2099-03-22",
            "start_time": "10:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert second_event.status_code == 400
    assert "single date" in second_event.json()["detail"].lower()


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
            "venue_id": venue_id,
            "exhibitors": [vendor_id],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400
    assert "vendor" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Edition attendance stats
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_edition_stats_requires_admin(unauth_client):
    r = await unauth_client.get("/api/editions/stats")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_edition_stats_aggregates_registrations(client):
    event = await _create_event(client, edition_id="edition-stats", title="Stats Night", date="2099-04-10")

    r1 = await _post_registration(client, event=event, name="Guest One", email="one@example.com", guest_count=2)
    assert r1.status_code == 201
    r2 = await _post_registration(client, event=event, name="Guest Two", email="two@example.com", guest_count=3)
    assert r2.status_code == 201

    # Check one of them in.
    reg_id = r1.json()["id"]
    r = await client.get(f"/api/registrations/{reg_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    token = r.json()["check_in_token"]
    r = await client.post(f"/api/check-in/{reg_id}/lookup", json={"token": token})
    assert r.status_code == 200
    r = await client.post(f"/api/check-in/{reg_id}", json={"token": token})
    assert r.status_code == 200

    # A cancelled registration must not count.
    r3 = await _post_registration(client, event=event, name="Guest Three", email="three@example.com", guest_count=1)
    cancelled_id = r3.json()["id"]
    r = await client.put(
        f"/api/registrations/{cancelled_id}",
        json={"status": "cancelled"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get("/api/editions/stats", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    entry = next(e for e in r.json() if e["edition_id"] == "edition-stats")
    assert entry["events_count"] == 1
    assert entry["total_registrations"] == 2
    assert entry["total_guests"] == 5
    assert entry["total_checked_in"] == 2
    assert entry["start_date"] == "2099-04-10"


@pytest.mark.anyio
async def test_edition_stats_includes_editions_with_no_registrations(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]
    r = await client.post(
        "/api/editions",
        json={"id": "edition-stats-empty", "year": 2100, "month": "march", "venue_id": venue_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.get("/api/editions/stats", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    entry = next(e for e in r.json() if e["edition_id"] == "edition-stats-empty")
    assert entry["total_registrations"] == 0
    assert entry["total_guests"] == 0
    assert entry["total_checked_in"] == 0
    assert entry["events_count"] == 0
