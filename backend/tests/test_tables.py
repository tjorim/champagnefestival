"""Tests for the tables API."""

from __future__ import annotations

import pytest

from tests.helpers import (
    ADMIN_HEADERS,
    ROOM_PAYLOAD,
    TABLE_TYPE_PAYLOAD,
    VENUE_PAYLOAD,
    _post_registration,
)


@pytest.mark.anyio
async def test_table_crud(client):
    # Tables require a table_type and a layout (which requires a room, which requires a venue)
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    layout_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    payload = {
        "name": "Table 1",
        "capacity": 6,
        "x": 25.0,
        "y": 30.0,
        "table_type_id": tt_id,
        "layout_id": layout_id,
    }

    r = await client.post("/api/tables", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    tbl_id = r.json()["id"]

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1

    r = await client.put(f"/api/tables/{tbl_id}", json={"capacity": 8}, headers=ADMIN_HEADERS)
    assert r.json()["capacity"] == 8

    r = await client.delete(f"/api/tables/{tbl_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    assert r.json() == []


@pytest.mark.anyio
async def test_table_with_layout_id(client):
    """Tables can be assigned a layout_id and it is persisted."""
    # Build the prerequisite chain: venue → room → layout + table_type
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    layout_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    # Create a table assigned to that layout
    r = await client.post(
        "/api/tables",
        json={
            "name": "T1",
            "capacity": 4,
            "x": 10.0,
            "y": 10.0,
            "table_type_id": tt_id,
            "layout_id": layout_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    assert r.json()["layout_id"] == layout_id

    # Update layout assignment via PUT
    tbl_id = r.json()["id"]
    r = await client.put(f"/api/tables/{tbl_id}", json={"layout_id": layout_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_table_id_can_be_cleared(client):
    """table_id on a reservation can be explicitly cleared to null."""
    # Create a reservation
    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201
    res_id = r.json()["id"]

    # Create table prerequisites: venue → room → layout + table_type
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    layout_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    # Create a table
    r = await client.post(
        "/api/tables",
        json={
            "name": "T-Clear",
            "capacity": 4,
            "table_type_id": tt_id,
            "layout_id": layout_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    tbl_id = r.json()["id"]

    # Assign the table
    r = await client.put(
        f"/api/registrations/{res_id}",
        json={"table_id": tbl_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["table_id"] == tbl_id

    # Clear the table (set to null)
    r = await client.put(
        f"/api/registrations/{res_id}",
        json={"table_id": None},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["table_id"] is None


@pytest.mark.anyio
async def test_table_registration_ids_computed_from_registration_table_id(client):
    """registration_ids on a table must reflect Registration.table_id after reload.

    Regression test: previously Table.registration_ids was a denormalized JSON
    array that was never updated when a registration was assigned via
    PUT /api/registrations/{id}.  On a fresh GET /api/tables the array appeared
    empty, making the layout editor lose all assignments after a page reload.
    """
    # Create a reservation
    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201
    res_id = r.json()["id"]

    # Build prerequisites: venue → room → layout + table_type
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    layout_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    # Create a table
    r = await client.post(
        "/api/tables",
        json={
            "name": "T-Persist",
            "capacity": 4,
            "table_type_id": tt_id,
            "layout_id": layout_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    tbl_id = r.json()["id"]
    # A new table has no reservations yet
    assert r.json()["registration_ids"] == []

    # Assign the reservation to the table via the reservation endpoint
    r = await client.put(
        f"/api/registrations/{res_id}",
        json={"table_id": tbl_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["table_id"] == tbl_id

    # GET /api/tables must now reflect the assignment without any extra call
    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    tables = r.json()
    tbl = next(t for t in tables if t["id"] == tbl_id)
    assert res_id in tbl["registration_ids"], (
        "registration_ids should be computed from Registration.table_id on every GET"
    )

    # GET /api/tables/{id} must also reflect the assignment
    r = await client.get(f"/api/tables/{tbl_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert res_id in r.json()["registration_ids"]

    # After clearing the table assignment the list must also update
    r = await client.put(
        f"/api/registrations/{res_id}",
        json={"table_id": None},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    tbl = next(t for t in r.json() if t["id"] == tbl_id)
    assert tbl["registration_ids"] == []
