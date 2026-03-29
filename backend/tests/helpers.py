"""Shared constants and helper functions for backend integration tests."""

from __future__ import annotations

ADMIN_TOKEN = "test-admin-token"
ADMIN_HEADERS = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

VENUE_PAYLOAD = {"name": "Test Venue"}

ROOM_PAYLOAD = {
    "name": "Main Hall",
    "width_m": 25.0,
    "length_m": 18.0,
    "color": "#ffc107",
}

TABLE_TYPE_PAYLOAD = {"name": "Standard", "max_capacity": 6}

VALID_RESERVATION = {
    "name": "Jean Dupont",
    "email": "jean@example.com",
    "phone": "+32499000000",
    "event_id": "event-fri",
    "event_title": "Vrijdagavond",
    "guest_count": 2,
    "pre_orders": [
        {
            "product_id": "champagne-standard",
            "name": "Champagne Bottle (Standard)",
            "quantity": 1,
            "price": 65.0,
            "category": "champagne",
            "delivered": False,
        }
    ],
    "notes": "",
    "honeypot": "",
    "form_start_time": "",
}


async def _create_event(
    client,
    *,
    edition_id: str = "edition-public",
    edition_active: bool = True,
    event_active: bool = True,
    registration_required: bool = True,
    registrations_open_from: str | None = None,
    max_capacity: int | None = None,
    title: str = "Vrijdagavond",
    date: str = "2099-03-21",
):
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
            "active": edition_active,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    event_payload: dict[str, object] = {
        "edition_id": edition_id,
        "title": title,
        "description": "",
        "date": date,
        "start_time": "18:00",
        "end_time": "22:00",
        "category": "festival",
        "registration_required": registration_required,
        "active": event_active,
    }
    if registrations_open_from is not None:
        event_payload["registrations_open_from"] = registrations_open_from
    if max_capacity is not None:
        event_payload["max_capacity"] = max_capacity

    event_response = await client.post("/api/events", json=event_payload, headers=ADMIN_HEADERS)
    assert event_response.status_code == 201
    return event_response.json()


def _registration_body(event: dict, **overrides):
    body = {
        **VALID_RESERVATION,
        "event_id": event["id"],
        "event_title": event["title"],
        **overrides,
    }
    return body


async def _post_registration(
    client,
    *,
    path: str = "/api/registrations",
    event: dict | None = None,
    event_kwargs: dict | None = None,
    **overrides,
):
    event_kwargs = dict(event_kwargs or {})
    if event is None:
        event_kwargs.setdefault("title", overrides.get("event_title", VALID_RESERVATION["event_title"]))
        event = await _create_event(client, **event_kwargs)
    return await client.post(path, json=_registration_body(event, **overrides))


async def _create_layout_prerequisites(client):
    """Helper: create venue → room → layout; return layout_id."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    return r.json()["id"]
