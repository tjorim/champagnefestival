"""Tests for public registration creation endpoint."""

from __future__ import annotations

import pytest

from tests.helpers import (
    ADMIN_HEADERS,
    VALID_RESERVATION,
    VENUE_PAYLOAD,
    _create_event,
    _post_registration,
    _registration_body,
)


@pytest.mark.anyio
async def test_create_reservation(client):
    r = await _post_registration(client)
    assert r.status_code == 201
    data = r.json()
    assert data["person"]["name"] == "Jean Dupont"
    assert data["status"] == "pending"
    assert "check_in_token" not in data  # must not be returned here


@pytest.mark.anyio
async def test_create_reservation_rejects_event_without_public_registrations(client):
    event = await _create_event(client, registration_required=False)

    r = await client.post(
        "/api/registrations",
        json=_registration_body(event),
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "This event does not accept registrations."


@pytest.mark.anyio
async def test_create_reservation_rejects_registrations_before_opening(client):
    event = await _create_event(client, registrations_open_from="2099-03-22T00:00:00+00:00")

    r = await client.post(
        "/api/registrations",
        json=_registration_body(event),
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "Registrations for this event are not open yet."


@pytest.mark.anyio
async def test_create_reservation_rejects_fully_booked_event(client):
    event = await _create_event(client, max_capacity=2)

    first = await client.post(
        "/api/registrations",
        json={**VALID_RESERVATION, "event_id": event["id"], "guest_count": 2},
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/registrations",
        json={
            **VALID_RESERVATION,
            "event_id": event["id"],
            "email": "other@example.com",
            "phone": "+32499000001",
        },
    )

    assert second.status_code == 400
    assert second.json()["detail"] == "This event is fully booked."


@pytest.mark.anyio
async def test_create_reservation_rejects_inactive_event(client):
    event = await _create_event(client, event_active=False)

    r = await client.post(
        "/api/registrations",
        json=_registration_body(event),
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "Registrations are not available for this event."


@pytest.mark.anyio
async def test_event_rejects_registration_window_without_registration_required(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]
    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-event-validation",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    r = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-event-validation",
            "title": "Walk-in Only Event",
            "description": "",
            "date": "2099-03-21",
            "start_time": "18:00",
            "end_time": "22:00",
            "category": "festival",
            "registration_required": False,
            "registrations_open_from": "2099-03-20T00:00:00+00:00",
        },
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 400
    assert (
        r.json()["detail"]
        == "registrations_open_from and max_capacity may only be set when registration_required is true."
    )


@pytest.mark.anyio
async def test_honeypot_rejected(client):
    event = await _create_event(client)
    body = _registration_body(event, honeypot="bot-value")
    r = await client.post("/api/registrations", json=body)
    assert r.status_code == 400
    assert r.json()["detail"] == "Submission rejected."


@pytest.mark.anyio
async def test_spam_invalid_timestamp(client):
    """A non-ISO form_start_time is rejected (bot protection)."""
    event = await _create_event(client)
    r = await client.post(
        "/api/registrations",
        json=_registration_body(event, form_start_time="1234567890"),
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Submission rejected."
