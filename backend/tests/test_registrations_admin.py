"""Tests for admin registration list, detail, search/filter, and admin creation."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import Registration
from app.schemas import RegistrationUpdate
from app.services import registrations_service
from tests.helpers import (
    ADMIN_HEADERS,
    VENUE_PAYLOAD,
    _create_event,
    _post_registration,
    _registration_body,
)

# ---------------------------------------------------------------------------
# Admin list / detail
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_requires_auth(unauth_client):
    r = await unauth_client.get("/api/registrations")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_list_and_detail(client):
    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201

    r = await client.get("/api/registrations", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    body = r.json()
    items = body["items"]
    assert body["total"] == 1
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
    body = r.json()
    items = body["items"]
    assert body["total"] == 1
    assert len(items) == 1
    assert items[0]["person"]["name"] == "Jean Dupont"


@pytest.mark.anyio
async def test_search_by_email(client):
    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201

    r = await client.get("/api/registrations", params={"q": "example.com"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1


@pytest.mark.anyio
async def test_filter_by_status(client):
    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201
    r_list = await client.get("/api/registrations", headers=ADMIN_HEADERS)
    res_id = r_list.json()["items"][0]["id"]

    # Confirm the reservation
    r = await client.put(
        f"/api/registrations/{res_id}",
        json={"status": "confirmed"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get("/api/registrations", params={"status": "confirmed"}, headers=ADMIN_HEADERS)
    assert len(r.json()["items"]) == 1

    r = await client.get("/api/registrations", params={"status": "pending"}, headers=ADMIN_HEADERS)
    assert len(r.json()["items"]) == 0


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
async def test_admin_cannot_check_in_canceled_registration(client):
    created = await _post_registration(client)
    registration_id = created.json()["id"]
    cancelled = await client.put(
        f"/api/registrations/{registration_id}",
        json={"status": "cancelled"},
        headers=ADMIN_HEADERS,
    )
    assert cancelled.status_code == 200

    checked_in = await client.put(
        f"/api/registrations/{registration_id}",
        json={"checked_in": True},
        headers=ADMIN_HEADERS,
    )
    assert checked_in.status_code == 409


@pytest.mark.anyio
async def test_admin_must_uncheck_registration_before_canceling(client):
    created = await _post_registration(client)
    registration_id = created.json()["id"]
    checked_in = await client.put(
        f"/api/registrations/{registration_id}",
        json={"checked_in": True},
        headers=ADMIN_HEADERS,
    )
    assert checked_in.status_code == 200

    cancelled = await client.put(
        f"/api/registrations/{registration_id}",
        json={"status": "cancelled"},
        headers=ADMIN_HEADERS,
    )
    assert cancelled.status_code == 409

    cancelled_and_unchecked = await client.put(
        f"/api/registrations/{registration_id}",
        json={"status": "cancelled", "checked_in": False},
        headers=ADMIN_HEADERS,
    )
    assert cancelled_and_unchecked.status_code == 200
    assert cancelled_and_unchecked.json()["status"] == "cancelled"
    assert cancelled_and_unchecked.json()["checked_in"] is False


@pytest.mark.anyio
async def test_concurrent_cancel_and_check_in_preserve_registration_invariant(client, engine):
    created = await _post_registration(client)
    registration_id = created.json()["id"]
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as cancel_session, factory() as check_in_session:
        cancel_registration = await registrations_service.get_registration_or_404(cancel_session, registration_id)
        check_in_registration = await registrations_service.get_registration_or_404(check_in_session, registration_id)
        results = await asyncio.gather(
            registrations_service.apply_registration_update(
                cancel_session,
                cancel_registration,
                RegistrationUpdate(status="cancelled"),
                actor="cancel-test",
            ),
            registrations_service.apply_registration_update(
                check_in_session,
                check_in_registration,
                RegistrationUpdate(checked_in=True),
                actor="check-in-test",
            ),
            return_exceptions=True,
        )

    conflicts = [result for result in results if isinstance(result, HTTPException)]
    assert len(conflicts) == 1
    assert conflicts[0].status_code == 409

    async with factory() as verify_session:
        registration = await verify_session.scalar(select(Registration).where(Registration.id == registration_id))
        assert registration is not None
        assert not (registration.status == "cancelled" and registration.checked_in)


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
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["event_id"] == friday.json()["event_id"]


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
    first_page_body = first_page.json()
    first_page_results = first_page_body["items"]
    assert len(first_page_results) == 2
    assert first_page_body["limit"] == 2
    assert first_page_body["page"] == 1
    assert first_page_body["total"] >= 3

    second_page = await client.get("/api/registrations", params={"limit": 2, "page": 2}, headers=ADMIN_HEADERS)
    assert second_page.status_code == 200
    second_page_body = second_page.json()
    second_page_results = second_page_body["items"]
    assert len(second_page_results) == 1
    assert second_page_body["total"] == first_page_body["total"]

    first_page_ids = {row["id"] for row in first_page_results}
    second_page_ids = {row["id"] for row in second_page_results}
    assert first_page_ids.isdisjoint(second_page_ids)

    # Ordering must be consistent with the unpaginated endpoint
    all_response = await client.get("/api/registrations", headers=ADMIN_HEADERS)
    assert all_response.status_code == 200
    all_results = all_response.json()["items"]
    # Filter to only the IDs created in this test to avoid interference from other tests
    created_ids = first_page_ids | second_page_ids
    all_test_results = [r for r in all_results if r["id"] in created_ids]
    assert all_test_results[:2] == first_page_results
    assert all_test_results[2:3] == second_page_results


@pytest.mark.anyio
async def test_filter_by_person_id(client):
    event = await _create_event(client, edition_id="edition-filter-by-person-id")
    jean = await _post_registration(client, path="/api/registrations", event=event)
    assert jean.status_code == 201
    marie = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        name="Marie Curie",
        email="marie-person-filter@example.com",
    )
    assert marie.status_code == 201

    r = await client.get(
        "/api/registrations",
        params={"person_id": marie.json()["person_id"]},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == marie.json()["id"]


@pytest.mark.anyio
async def test_filter_by_edition_id(client):
    friday = await _post_registration(
        client, path="/api/registrations", event_kwargs={"edition_id": "edition-filter-by-edition-id"}
    )
    assert friday.status_code == 201
    other_edition_event = await _create_event(client, edition_id="edition-filter-by-edition-id-other")
    other = await client.post(
        "/api/registrations",
        json=_registration_body(other_edition_event, email="other-edition@example.com"),
    )
    assert other.status_code == 201

    r = await client.get(
        "/api/registrations",
        params={"edition_id": "edition-filter-by-edition-id"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == friday.json()["id"]


@pytest.mark.anyio
async def test_filter_by_event_date(client):
    friday = await _post_registration(
        client,
        path="/api/registrations",
        event_kwargs={"edition_id": "edition-filter-by-date", "date": "2099-05-01"},
    )
    assert friday.status_code == 201
    saturday_event = await _create_event(client, edition_id="edition-filter-by-date-sat", date="2099-05-02")
    saturday = await client.post(
        "/api/registrations",
        json=_registration_body(saturday_event, email="other-date@example.com"),
    )
    assert saturday.status_code == 201

    r = await client.get(
        "/api/registrations",
        params={"event_date": "2099-05-01"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == friday.json()["id"]


async def _create_standalone_event(client, *, edition_id: str, edition_type: str = "bourse"):
    """A registration event under a non-festival edition (see test_editions.py for edition_type)."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": edition_id,
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
            "edition_type": edition_type,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    event_response = await client.post(
        "/api/events",
        json={
            "edition_id": edition_id,
            "title": "Bourse afternoon",
            "description": "",
            "date": "2099-04-01",
            "start_time": "13:00",
            "end_time": "17:00",
            "category": "bourse",
            "registration_required": True,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert event_response.status_code == 201
    return event_response.json()


@pytest.mark.anyio
async def test_filter_by_edition_category(client):
    festival_event = await _create_event(client, edition_id="edition-category-festival")
    festival_reg = await client.post(
        "/api/registrations",
        json=_registration_body(festival_event, email="festival-category@example.com"),
    )
    assert festival_reg.status_code == 201

    standalone_event = await _create_standalone_event(client, edition_id="edition-category-standalone")
    standalone_reg = await client.post(
        "/api/registrations",
        json=_registration_body(standalone_event, email="standalone-category@example.com"),
    )
    assert standalone_reg.status_code == 201

    festival_response = await client.get(
        "/api/registrations", params={"edition_category": "festival"}, headers=ADMIN_HEADERS
    )
    festival_ids = {row["id"] for row in festival_response.json()["items"]}
    assert festival_reg.json()["id"] in festival_ids
    assert standalone_reg.json()["id"] not in festival_ids

    standalone_response = await client.get(
        "/api/registrations", params={"edition_category": "standalone"}, headers=ADMIN_HEADERS
    )
    standalone_ids = {row["id"] for row in standalone_response.json()["items"]}
    assert standalone_reg.json()["id"] in standalone_ids
    assert festival_reg.json()["id"] not in standalone_ids


@pytest.mark.anyio
async def test_sort_by_guest_count(client):
    event = await _create_event(client, edition_id="edition-sort-guest-count")
    low = await client.post(
        "/api/registrations",
        json=_registration_body(event, email="low-guests@example.com", guest_count=1),
    )
    assert low.status_code == 201
    high = await client.post(
        "/api/registrations",
        json=_registration_body(event, email="high-guests@example.com", guest_count=4),
    )
    assert high.status_code == 201

    ascending = await client.get(
        "/api/registrations",
        params={"event_id": event["id"], "sort": "guest_count", "sort_dir": "asc"},
        headers=ADMIN_HEADERS,
    )
    ascending_ids = [row["id"] for row in ascending.json()["items"]]
    assert ascending_ids == [low.json()["id"], high.json()["id"]]

    descending = await client.get(
        "/api/registrations",
        params={"event_id": event["id"], "sort": "guest_count", "sort_dir": "desc"},
        headers=ADMIN_HEADERS,
    )
    descending_ids = [row["id"] for row in descending.json()["items"]]
    assert descending_ids == [high.json()["id"], low.json()["id"]]


@pytest.mark.anyio
async def test_sort_by_name_overrides_search_relevance_ranking(client):
    event = await _create_event(client, edition_id="edition-sort-name")
    zoe = await client.post(
        "/api/registrations",
        json=_registration_body(event, name="Zoe Adams", email="zoe-sort@example.com"),
    )
    assert zoe.status_code == 201
    anna = await client.post(
        "/api/registrations",
        json=_registration_body(event, name="Anna Adams", email="anna-sort@example.com"),
    )
    assert anna.status_code == 201

    r = await client.get(
        "/api/registrations",
        params={"event_id": event["id"], "sort": "name", "sort_dir": "asc"},
        headers=ADMIN_HEADERS,
    )
    names = [row["person"]["name"] for row in r.json()["items"]]
    assert names == ["Anna Adams", "Zoe Adams"]


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
async def test_admin_create_reservation_requires_auth(unauth_client):
    r = await unauth_client.post(
        "/api/registrations/admin",
        json={"person_id": "x", "event_id": "e", "guest_count": 1},
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
            "guest_count": 1,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404
