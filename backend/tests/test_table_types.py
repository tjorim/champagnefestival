"""Tests for the table types API."""

from __future__ import annotations

import pytest

from tests.helpers import (
    ADMIN_HEADERS,
    ROOM_PAYLOAD,
    TABLE_TYPE_PAYLOAD,
    _create_venue,
)


@pytest.mark.anyio
async def test_table_type_crud(client):
    # Table type requires a venue
    venue_id = await _create_venue(client)

    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    table_type = r.json()
    assert table_type["name"] == "Standard"
    assert table_type["venue_id"] == venue_id
    type_id = table_type["id"]

    r = await client.get("/api/table-types", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert any(tt["id"] == type_id for tt in r.json())

    r = await client.get(f"/api/table-types/{type_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["name"] == "Standard"

    r = await client.put(f"/api/table-types/{type_id}", json={"capacity": 8}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["capacity"] == 8
    assert r.json()["name"] == "Standard"  # untouched fields survive a partial update

    r = await client.delete(f"/api/table-types/{type_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get(f"/api/table-types/{type_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_table_type_requires_admin(unauth_client):
    r = await unauth_client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD)
    assert r.status_code == 401


@pytest.mark.anyio
async def test_table_type_get_not_found(client):
    r = await client.get("/api/table-types/nonexistent", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_table_type_update_not_found(client):
    r = await client.put("/api/table-types/nonexistent", json={"capacity": 8}, headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_table_type_create_rejects_unknown_venue(client):
    r = await client.post(
        "/api/table-types",
        json={**TABLE_TYPE_PAYLOAD, "venue_id": "venue-missing"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_table_type_venue_reassignment(client):
    venue_a = await _create_venue(client)
    r = await client.post("/api/venues", json={"name": "Other Venue"}, headers=ADMIN_HEADERS)
    venue_b = r.json()["id"]

    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_a}, headers=ADMIN_HEADERS)
    type_id = r.json()["id"]

    r = await client.put(f"/api/table-types/{type_id}", json={"venue_id": venue_b}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["venue_id"] == venue_b


@pytest.mark.anyio
async def test_table_type_venue_reassignment_blocked_while_table_in_use_elsewhere(client):
    venue_a = await _create_venue(client)
    r = await client.post("/api/venues", json={"name": "Other Venue"}, headers=ADMIN_HEADERS)
    venue_b = r.json()["id"]

    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_a}, headers=ADMIN_HEADERS)
    type_id = r.json()["id"]

    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_a}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    layout_id = r.json()["id"]
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "x": 0.0, "y": 0.0, "table_type_id": type_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.put(f"/api/table-types/{type_id}", json={"venue_id": venue_b}, headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert "another venue" in r.json()["detail"]


@pytest.mark.anyio
async def test_table_type_venue_reassignment_rejects_unknown_venue(client):
    venue_id = await _create_venue(client)
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    type_id = r.json()["id"]

    r = await client.put(f"/api/table-types/{type_id}", json={"venue_id": "venue-missing"}, headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_table_type_round_shape_uses_larger_dimension_as_diameter(client):
    venue_id = await _create_venue(client)
    r = await client.post(
        "/api/table-types",
        json={
            "name": "Round",
            "venue_id": venue_id,
            "shape": "round",
            "width_m": 1.5,
            "length_m": 3.0,
            "capacity": 8,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    assert r.json()["length_m"] == r.json()["width_m"] == 3.0


@pytest.mark.anyio
async def test_table_type_delete_blocked_while_table_in_use(client):
    venue_id = await _create_venue(client)
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    type_id = r.json()["id"]

    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    layout_id = r.json()["id"]
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "x": 0.0, "y": 0.0, "table_type_id": type_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.delete(f"/api/table-types/{type_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert "tables" in r.json()["detail"]
