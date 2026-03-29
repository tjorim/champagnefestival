"""Tests for the rooms API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, ROOM_PAYLOAD, VENUE_PAYLOAD


@pytest.mark.anyio
async def test_room_crud(client):
    # Room requires a venue
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    venue_id = r.json()["id"]

    # Create
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Main Hall"
    assert data["width_m"] == 25.0
    assert data["length_m"] == 18.0
    room_id = data["id"]

    # List
    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1

    # Get
    r = await client.get(f"/api/rooms/{room_id}", headers=ADMIN_HEADERS)
    assert r.json()["name"] == "Main Hall"

    # Update
    r = await client.put(f"/api/rooms/{room_id}", json={"length_m": 20.0}, headers=ADMIN_HEADERS)
    assert r.json()["length_m"] == 20.0

    # Delete
    r = await client.delete(f"/api/rooms/{room_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert r.json() == []


@pytest.mark.anyio
async def test_room_requires_admin(client):
    r = await client.post("/api/rooms", json=ROOM_PAYLOAD)
    assert r.status_code == 401


@pytest.mark.anyio
async def test_room_invalid_color(client):
    r = await client.post(
        "/api/rooms",
        json={**ROOM_PAYLOAD, "color": "not-a-color"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422
