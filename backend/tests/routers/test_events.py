"""Tests for the events API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event


@pytest.mark.anyio
async def test_list_events_requires_auth(unauth_client):
    response = await unauth_client.get("/api/events")
    assert response.status_code == 401


@pytest.mark.anyio
async def test_create_event_accepts_mixed_timezone_registration_window(client):
    event = await _create_event(
        client,
        edition_id="edition-mixed-create-window",
        registrations_open_from="2099-03-20T18:00:00+01:00",
        registrations_close_at="2099-03-20T20:00:00",
    )

    assert event["registrations_close_at"] is not None


@pytest.mark.anyio
async def test_update_event_accepts_mixed_timezone_registration_window(client):
    event = await _create_event(client, edition_id="edition-mixed-update-window")

    response = await client.put(
        f"/api/events/{event['id']}",
        json={
            "registrations_open_from": "2099-03-20T18:00:00+01:00",
            "registrations_close_at": "2099-03-20T20:00:00",
        },
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200, response.text
    assert response.json()["registrations_close_at"] is not None


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
async def test_delete_event_rejects_when_registrations_exist(client):
    """A blocking registration must produce a clean 409, not a raw DB error.

    Regression test: without a pre-check, the delete reached the database and raised a
    raw ``NotNullViolationError`` (the ORM has no cascade for `event.registrations`, so it
    tried to null out the non-nullable `registrations.event_id`), which surfaced driver
    internals, SQL, and the full registration row (including its check-in token) to the caller.
    """
    event = await _create_event(client)
    await _register(client, event, guest_count=1, person_name="Alice")

    response = await client.delete(f"/api/events/{event['id']}", headers=ADMIN_HEADERS)

    assert response.status_code == 409
    body = response.json()
    assert "1 registration" in body["detail"]
    assert "IntegrityError" not in response.text
    assert "NotNullViolation" not in response.text
    assert "check_in_token" not in response.text

    # the event must survive the rejected delete
    get_response = await client.get(f"/api/events/{event['id']}", headers=ADMIN_HEADERS)
    assert get_response.status_code == 200


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

    assert stats[event["id"]]["event_title"] == event["title"]
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


@pytest.mark.anyio
async def test_registration_dashboard_stats(client):
    active_event = await _create_event(client, edition_id="dashboard-festival")
    other_event = await _create_event(client, edition_id="dashboard-bourse", edition_type="bourse", date="2099-03-22")
    checked_in = await _register(client, active_event, guest_count=3, person_name="Group")
    pending = await _register(client, other_event, guest_count=2, person_name="Pending")
    cancelled = await _register(client, active_event, guest_count=5, person_name="Cancelled")
    for registration_id, status in [(pending, "pending"), (cancelled, "cancelled")]:
        response = await client.put(
            f"/api/registrations/{registration_id}", json={"status": status}, headers=ADMIN_HEADERS
        )
        assert response.status_code == 200, response.text

    async def read_stats():
        response = await client.get(
            "/api/registrations/stats",
            params={"edition_id": active_event["edition_id"], "event_date": active_event["date"]},
            headers=ADMIN_HEADERS,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        return body, {event["event_id"]: event for event in body.pop("events")}

    facets, events = await read_stats()
    assert facets == {"all": 3, "pending": 1, "confirmed": 1, "festival": 2, "standalone": 1, "active": 2, "today": 2}
    assert events[active_event["id"]] == {
        "event_id": active_event["id"],
        "event_title": active_event["title"],
        "edition_id": active_event["edition_id"],
        "total": 3,
        "checked_in": 0,
    }
    assert events[other_event["id"]]["total"] == 2

    response = await client.put(f"/api/registrations/{checked_in}", json={"checked_in": True}, headers=ADMIN_HEADERS)
    assert response.status_code == 200, response.text
    refreshed_facets, refreshed_events = await read_stats()
    assert refreshed_facets == facets
    assert refreshed_events[active_event["id"]]["checked_in"] == 3

    response = await client.get("/api/events/checkin-stats", headers=ADMIN_HEADERS)
    assert response.status_code == 200, response.text
    assert {event["event_id"]: event for event in response.json()} == {
        event_id: {key: value for key, value in event.items() if key != "edition_id"}
        for event_id, event in refreshed_events.items()
    }
