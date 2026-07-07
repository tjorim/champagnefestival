"""Tests for the venues API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, ROOM_PAYLOAD, VENUE_PAYLOAD


@pytest.mark.anyio
async def test_venue_crud(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    venue = r.json()
    assert venue["name"] == "Test Venue"
    venue_id = venue["id"]

    r = await client.get("/api/venues", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert any(v["id"] == venue_id for v in r.json())

    r = await client.get(f"/api/venues/{venue_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["name"] == "Test Venue"

    r = await client.put(f"/api/venues/{venue_id}", json={"city": "Bredene"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["city"] == "Bredene"
    assert r.json()["name"] == "Test Venue"  # untouched fields survive a partial update

    r = await client.delete(f"/api/venues/{venue_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get(f"/api/venues/{venue_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_venue_requires_admin(unauth_client):
    r = await unauth_client.post("/api/venues", json=VENUE_PAYLOAD)
    assert r.status_code == 401


@pytest.mark.anyio
async def test_venue_get_not_found(client):
    r = await client.get("/api/venues/nonexistent", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_venue_update_not_found(client):
    r = await client.put("/api/venues/nonexistent", json={"city": "Bredene"}, headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_venue_delete_blocked_while_edition_in_use(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]

    r = await client.post(
        "/api/editions",
        json={"id": "edition-venue-in-use", "year": 2027, "month": "march", "venue_id": venue_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.delete(f"/api/venues/{venue_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert "editions" in r.json()["detail"]


@pytest.mark.anyio
async def test_venue_delete_blocked_while_room_in_use(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]

    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201

    r = await client.delete(f"/api/venues/{venue_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert "rooms" in r.json()["detail"]
