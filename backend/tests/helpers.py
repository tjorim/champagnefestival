"""Shared constants and helper functions for backend integration tests."""

from __future__ import annotations

from typing import Any


def mcp_session_factory(db_session: Any) -> Any:
    """Wrap a real ``db_session`` fixture as an ``async with``-able session factory.

    MCP admin tool functions take a ``session_factory`` (mirroring
    ``app.database.async_session_factory``) rather than a session directly, so
    their tests need something that behaves like one. Every call returns the
    same underlying test session/transaction.
    """

    class _CM:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, *_exc: object) -> None:
            pass

    class _Factory:
        def __call__(self) -> _CM:
            return _CM()

    return _Factory()


# Auth headers sent with admin requests.  In tests the ``require_admin``
# dependency is overridden (see conftest.py), so these headers are not
# validated — they are kept for readability so test requests clearly signal
# "this is an admin call".
ADMIN_HEADERS: dict[str, str] = {}

VENUE_PAYLOAD = {"name": "Test Venue"}

ROOM_PAYLOAD = {
    "name": "Main Hall",
    "width_m": 25.0,
    "length_m": 18.0,
    "color": "#ffc107",
}

TABLE_TYPE_PAYLOAD = {"name": "Standard", "capacity": 6, "width_m": 0.7, "length_m": 1.8}


async def _create_venue(client) -> str:
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201, f"venue creation failed: {r.text}"
    return r.json()["id"]


VALID_RESERVATION = {
    "name": "Jean Dupont",
    "email": "jean@example.com",
    "phone": "+32499000000",
    "event_id": "event-fri",
    "guest_count": 2,
    # Registration creation now resolves order_items against the event's real
    # products server-side (see app.services.registrations_service.resolve_order_items),
    # so a fixture product_id with no matching Product would be rejected. Tests
    # that care about order contents on creation create a real product first
    # and override this field; everyone else gets an order-free registration.
    "order_items": [],
    "notes": "",
    "honeypot": "",
    "form_start_time": "",
}


async def _create_event(
    client,
    *,
    edition_id: str = "edition-public",
    edition_active: bool = True,
    edition_type: str = "festival",
    event_active: bool = True,
    registration_required: bool = True,
    registrations_open_from: str | None = None,
    registrations_close_at: str | None = None,
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
            "edition_type": edition_type,
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
    if registrations_close_at is not None:
        event_payload["registrations_close_at"] = registrations_close_at
    if max_capacity is not None:
        event_payload["max_capacity"] = max_capacity

    event_response = await client.post("/api/events", json=event_payload, headers=ADMIN_HEADERS)
    assert event_response.status_code == 201
    return event_response.json()


def _registration_body(event: dict, **overrides):
    overrides.pop("event_title", None)
    body = {
        **VALID_RESERVATION,
        "event_id": event["id"],
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
    event_title = overrides.get("event_title", "Vrijdagavond")
    if event is None:
        event_kwargs.setdefault("title", event_title)
        event = await _create_event(client, **event_kwargs)
    return await client.post(path, json=_registration_body(event, **overrides))


async def _create_layout_prerequisites(client, event_id: str | None = None):
    """Helper: create venue → room → layout; return layout_id."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201, f"venue creation failed: {r.text}"
    venue_id = r.json()["id"]
    if event_id:
        event = (await client.get(f"/api/events/{event_id}")).json()
        edition = (await client.get(f"/api/editions/{event['edition_id']}")).json()
        venue_id = edition["venue"]["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201, f"room creation failed: {r.text}"
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": event_id or await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, f"layout creation failed: {r.text}"
    return r.json()["id"]


async def event_for_room(client, room_id: str, number: int = 1, edition_id: str | None = None) -> str:
    """Create a stable event fixture for a room, reusing it within a test."""
    room = (await client.get(f"/api/rooms/{room_id}")).json()
    if "venue_id" not in room:
        return "missing-event"
    edition_id = edition_id or f"ed-{room_id}"
    edition = await client.get(f"/api/editions/{edition_id}")
    if edition.status_code == 404:
        response = await client.post(
            "/api/editions",
            json={"id": edition_id, "venue_id": room["venue_id"], "year": 2099, "month": "march", "active": True},
        )
        assert response.status_code == 201, response.text
    events = (await client.get("/api/events", params={"edition_id": edition_id})).json()
    title = f"Layout event {number}"
    for event in events:
        if event["title"] == title:
            return event["id"]
    response = await client.post(
        "/api/events",
        json={
            "edition_id": edition_id,
            "title": title,
            "date": f"2099-03-{20 + number:02d}",
            "start_time": "10:00",
            "category": "other",
            "registration_required": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def seed_layout_event(db, room_id: str = "room-1", number: int = 1) -> str:
    from datetime import date

    from app.models import Edition, Event, Room

    room = await db.get(Room, room_id)
    if room is None:
        return "missing-event"
    event_id = f"evt-{room_id}-{number}"
    if await db.get(Event, event_id) is not None:
        return event_id
    edition_id = f"ed-{room.venue_id}"
    if await db.get(Edition, edition_id) is None:
        db.add(Edition(id=edition_id, year=2099, month="march", venue_id=room.venue_id, active=False))
        await db.flush()
    db.add(
        Event(
            id=event_id,
            edition_id=edition_id,
            title=f"Event {number}",
            date=date(2099, 3, 20 + number),
            start_time="10:00",
            category="other",
        )
    )
    await db.flush()
    return event_id
