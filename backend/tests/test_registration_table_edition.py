"""Seating a registration must stay within its own edition's layouts."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, ROOM_PAYLOAD, TABLE_TYPE_PAYLOAD, VENUE_PAYLOAD


async def _edition_with_table(client, edition_id: str, date: str, venue_id: str, room_id: str, type_id: str) -> str:
    """Create an edition, its event, a layout for that day, and a table on it.

    The event comes first: layouts are validated against the edition's event
    dates, which is also why a bourse can carry a layout server-side at all.
    """
    r = await client.post(
        "/api/editions",
        json={
            "id": edition_id,
            "year": 2026,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text

    r = await client.post(
        "/api/events",
        json={
            "edition_id": edition_id,
            "title": "Bourse",
            "description": "",
            "date": date,
            "start_time": "09:00",
            "category": "other",
            "registration_required": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text

    r = await client.post(
        "/api/layouts",
        json={"edition_id": edition_id, "room_id": room_id, "date": date},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    layout_id = r.json()["id"]

    r = await client.post(
        "/api/tables",
        json={"name": f"Table {edition_id}", "capacity": 6, "table_type_id": type_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return r.json().get("table", r.json())["id"]


async def _registration_for(client, edition_id: str) -> str:
    r = await client.get("/api/events", params={"edition_id": edition_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    event_id = r.json()[0]["id"]

    r = await client.post("/api/people", json={"name": "Collector", "roles": ["visitor"]}, headers=ADMIN_HEADERS)
    person_id = r.json()["id"]

    r = await client.post(
        "/api/registrations/admin",
        json={"person_id": person_id, "event_id": event_id, "guest_count": 1},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.anyio
async def test_table_from_another_edition_is_rejected(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    type_id = r.json()["id"]

    festival_table = await _edition_with_table(client, "festival-2026", "2026-03-06", venue_id, room_id, type_id)
    bourse_table = await _edition_with_table(client, "bourse-2026", "2026-11-21", venue_id, room_id, type_id)
    registration_id = await _registration_for(client, "bourse-2026")

    # Cross-edition seating is refused...
    r = await client.put(
        f"/api/registrations/{registration_id}", json={"table_id": festival_table}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 400, r.text
    assert "festival-2026" in r.json()["detail"]

    # ...while a table from the registration's own edition works.
    r = await client.put(
        f"/api/registrations/{registration_id}", json={"table_id": bourse_table}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200, r.text
    assert r.json()["table_id"] == bourse_table

    # Clearing the assignment stays allowed.
    r = await client.put(f"/api/registrations/{registration_id}", json={"table_id": None}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["table_id"] is None


@pytest.mark.anyio
async def test_unknown_table_is_a_404(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    type_id = r.json()["id"]
    await _edition_with_table(client, "bourse-2026", "2026-11-21", venue_id, room_id, type_id)
    registration_id = await _registration_for(client, "bourse-2026")

    r = await client.put(
        f"/api/registrations/{registration_id}", json={"table_id": "tbl_missing"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 404, r.text
