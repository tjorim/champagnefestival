"""Tests for the table types API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, ROOM_PAYLOAD, TABLE_TYPE_PAYLOAD, VENUE_PAYLOAD


@pytest.mark.anyio
async def test_table_type_crud(client):
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    table_type = r.json()
    assert table_type["name"] == "Standard"
    type_id = table_type["id"]

    r = await client.get("/api/table-types", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert any(tt["id"] == type_id for tt in r.json())

    r = await client.get(f"/api/table-types/{type_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["name"] == "Standard"

    r = await client.put(f"/api/table-types/{type_id}", json={"max_capacity": 8}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["max_capacity"] == 8
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
    r = await client.put("/api/table-types/nonexistent", json={"max_capacity": 8}, headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_table_type_round_shape_normalises_length_to_width(client):
    r = await client.post(
        "/api/table-types",
        json={"name": "Round", "shape": "round", "width_m": 1.5, "length_m": 3.0, "max_capacity": 8},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    assert r.json()["length_m"] == r.json()["width_m"] == 1.5


@pytest.mark.anyio
async def test_table_type_delete_blocked_while_table_in_use(client):
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    type_id = r.json()["id"]

    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    layout_id = r.json()["id"]
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "capacity": 4, "x": 0.0, "y": 0.0, "table_type_id": type_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.delete(f"/api/table-types/{type_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert "tables" in r.json()["detail"]
