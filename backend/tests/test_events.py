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
async def test_reactivating_with_guest_count_change_checks_event_capacity(client):
    event = await _create_event(client, edition_id="edition-reactivate-capacity", max_capacity=3)
    await _register(client, event, guest_count=2, person_name="Active Guest")
    cancelled_id = await _register(client, event, guest_count=1, person_name="Cancelled Guest")
    cancel_response = await client.put(
        f"/api/registrations/{cancelled_id}",
        json={"status": "cancelled"},
        headers=ADMIN_HEADERS,
    )
    assert cancel_response.status_code == 200, cancel_response.text

    response = await client.put(
        f"/api/registrations/{cancelled_id}",
        json={"status": "confirmed", "guest_count": 2},
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "This event is fully booked."


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
