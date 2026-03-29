"""Tests for admin registration list, detail, search/filter, and admin creation."""

from __future__ import annotations

import pytest

from tests.helpers import (
    ADMIN_HEADERS,
    _create_event,
    _post_registration,
    _registration_body,
)

# ---------------------------------------------------------------------------
# Admin list / detail
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_requires_auth(client):
    r = await client.get("/api/registrations")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_list_and_detail(client):
    await _post_registration(client, path="/api/registrations")

    r = await client.get("/api/registrations", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert "check_in_token" not in items[0]  # stripped from list

    res_id = items[0]["id"]
    r = await client.get(f"/api/registrations/{res_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    detail = r.json()
    assert "check_in_token" in detail  # present in detail view


# ---------------------------------------------------------------------------
# Search / filter
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_search_by_name(client):
    event = await _create_event(client)
    r = await _post_registration(client, path="/api/registrations", event=event)
    assert r.status_code == 201
    r = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        name="Marie Curie",
        email="marie@example.com",
    )
    assert r.status_code == 201

    r = await client.get("/api/registrations", params={"q": "jean"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["person"]["name"] == "Jean Dupont"


@pytest.mark.anyio
async def test_search_by_email(client):
    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201

    r = await client.get("/api/registrations", params={"q": "example.com"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_filter_by_status(client):
    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201
    r_list = await client.get("/api/registrations", headers=ADMIN_HEADERS)
    res_id = r_list.json()[0]["id"]

    # Confirm the reservation
    r = await client.put(
        f"/api/registrations/{res_id}",
        json={"status": "confirmed"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get("/api/registrations", params={"status": "confirmed"}, headers=ADMIN_HEADERS)
    assert len(r.json()) == 1

    r = await client.get("/api/registrations", params={"status": "pending"}, headers=ADMIN_HEADERS)
    assert len(r.json()) == 0


@pytest.mark.anyio
async def test_admin_uncheckin_clears_checked_in_at(client):
    event = await _create_event(client, edition_id="edition-checkin-reset")
    r = await client.post(
        "/api/registrations",
        json=_registration_body(event),
    )
    assert r.status_code == 201

    reservation_id = r.json()["id"]
    checked_in = await client.put(
        f"/api/registrations/{reservation_id}",
        json={"checked_in": True},
        headers=ADMIN_HEADERS,
    )
    assert checked_in.status_code == 200
    assert checked_in.json()["checked_in_at"] is not None

    unchecked = await client.put(
        f"/api/registrations/{reservation_id}",
        json={"checked_in": False},
        headers=ADMIN_HEADERS,
    )
    assert unchecked.status_code == 200
    assert unchecked.json()["checked_in"] is False
    assert unchecked.json()["checked_in_at"] is None


@pytest.mark.anyio
async def test_filter_by_event(client):
    friday = await _post_registration(client, path="/api/registrations")
    assert friday.status_code == 201
    saturday_event = await _create_event(
        client,
        edition_id="edition-filter-by-event-sat",
        title="Zaterdagavond",
        date="2099-03-22",
    )
    saturday = await client.post(
        "/api/registrations",
        json=_registration_body(saturday_event, email="other@example.com"),
    )
    assert saturday.status_code == 201

    r = await client.get("/api/registrations", params={"event_id": friday.json()["event_id"]}, headers=ADMIN_HEADERS)
    assert len(r.json()) == 1
    assert r.json()[0]["event_id"] == friday.json()["event_id"]


@pytest.mark.anyio
async def test_registrations_support_limit_and_page(client):
    event = await _create_event(client, edition_id="edition-registration-pagination")
    for index in range(3):
        created = await _post_registration(
            client,
            path="/api/registrations",
            event=event,
            email=f"page{index}@example.com",
            phone=f"+3249900001{index}",
            name=f"Page User {index}",
        )
        assert created.status_code == 201

    first_page = await client.get("/api/registrations", params={"limit": 2, "page": 1}, headers=ADMIN_HEADERS)
    assert first_page.status_code == 200
    first_page_results = first_page.json()
    assert len(first_page_results) == 2

    second_page = await client.get("/api/registrations", params={"limit": 2, "page": 2}, headers=ADMIN_HEADERS)
    assert second_page.status_code == 200
    second_page_results = second_page.json()
    assert len(second_page_results) == 1

    first_page_ids = {row["id"] for row in first_page_results}
    second_page_ids = {row["id"] for row in second_page_results}
    assert first_page_ids.isdisjoint(second_page_ids)

    # Ordering must be consistent with the unpaginated endpoint
    all_response = await client.get("/api/registrations", headers=ADMIN_HEADERS)
    assert all_response.status_code == 200
    all_results = all_response.json()
    # Filter to only the IDs created in this test to avoid interference from other tests
    created_ids = first_page_ids | second_page_ids
    all_test_results = [r for r in all_results if r["id"] in created_ids]
    assert all_test_results[:2] == first_page_results
    assert all_test_results[2:3] == second_page_results


# ---------------------------------------------------------------------------
# Admin reservation creation
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_admin_create_reservation(client):
    """Admin endpoint creates reservation directly for a known person."""
    r = await client.post(
        "/api/people",
        json={
            "name": "Pierre Admin",
            "email": "pierre@example.com",
            "phone": "+32499111222",
        },
        headers=ADMIN_HEADERS,
    )
    person_id = r.json()["id"]

    event = await _create_event(client, edition_id="edition-admin-create", title="Vrijdagavond")
    r = await client.post(
        "/api/registrations/admin",
        json={
            "person_id": person_id,
            "event_id": event["id"],
            "event_title": event["title"],
            "guest_count": 3,
            "status": "confirmed",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["person_id"] == person_id
    assert data["person"]["name"] == "Pierre Admin"
    assert data["status"] == "confirmed"
    assert "check_in_token" not in data


@pytest.mark.anyio
async def test_admin_create_reservation_requires_auth(client):
    r = await client.post(
        "/api/registrations/admin",
        json={"person_id": "x", "event_id": "e", "event_title": "t", "guest_count": 1},
    )
    assert r.status_code == 401


@pytest.mark.anyio
async def test_admin_create_reservation_person_not_found(client):
    event = await _create_event(client, edition_id="edition-admin-person-missing", title="Vrijdagavond")
    r = await client.post(
        "/api/registrations/admin",
        json={
            "person_id": "nonexistent",
            "event_id": event["id"],
            "event_title": event["title"],
            "guest_count": 1,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404
