"""Tests for the layouts API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, ROOM_PAYLOAD, TABLE_TYPE_PAYLOAD, VENUE_PAYLOAD


@pytest.mark.anyio
async def test_layout_rejects_duplicate_room_day(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]

    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 4}, headers=ADMIN_HEADERS)
    assert r.status_code == 201

    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 4}, headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert r.json()["detail"] == "A layout already exists for this room and day."


@pytest.mark.anyio
async def test_copy_layout_basic(client):
    """Copying a layout to a new day creates a new layout entry."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    source_id = r.json()["id"]

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={"room_id": room_id, "day_id": 2},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["room_id"] == room_id
    assert data["day_id"] == 2
    assert data["id"] != source_id


@pytest.mark.anyio
async def test_copy_layout_404_source(client):
    """Copying a nonexistent source layout returns 404."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]

    r = await client.post(
        "/api/layouts/nonexistent-id/copy",
        json={"room_id": room_id, "day_id": 1},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_copy_layout_409_duplicate(client):
    """Copying to a day that already has a layout for the same room returns 409."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    source_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 2}, headers=ADMIN_HEADERS)
    assert r.status_code == 201

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={"room_id": room_id, "day_id": 2},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "A layout already exists for this room and day."


@pytest.mark.anyio
async def test_copy_layout_copies_tables(client):
    """copy_tables=True copies tables that are outside areas to the new layout."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    source_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    # Add a table to the source layout (no area, so it is an "outside" table)
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "capacity": 4, "x": 10.0, "y": 10.0, "table_type_id": tt_id, "layout_id": source_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={"room_id": room_id, "day_id": 2, "copy_tables": True, "copy_areas": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    new_layout_id = r.json()["id"]

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    tables_in_new = [t for t in r.json() if t["layout_id"] == new_layout_id]
    assert len(tables_in_new) == 1
    assert tables_in_new[0]["name"] == "T1"


@pytest.mark.anyio
async def test_copy_layout_copies_areas(client):
    """copy_areas=True copies areas (and tables inside them) to the new layout."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    source_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    # Add an area covering the top-left of the room
    r = await client.post(
        "/api/areas",
        json={
            "layout_id": source_id,
            "label": "Zone A",
            "icon": "bi-star",
            "width_m": 10.0,
            "length_m": 10.0,
            "x": 0.0,
            "y": 0.0,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    # Add a table inside that area (x=10%, y=10% of a 25m×18m room = 2.5m, 1.8m — inside the 10m×10m area)
    r = await client.post(
        "/api/tables",
        json={"name": "InArea", "capacity": 4, "x": 10.0, "y": 10.0, "table_type_id": tt_id, "layout_id": source_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={"room_id": room_id, "day_id": 2, "copy_tables": False, "copy_areas": True},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    new_layout_id = r.json()["id"]

    # Both the area and the table inside it should be copied
    r = await client.get("/api/areas", params={"layout_id": new_layout_id}, headers=ADMIN_HEADERS)
    assert len(r.json()) == 1
    assert r.json()[0]["label"] == "Zone A"

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    tables_in_new = [t for t in r.json() if t["layout_id"] == new_layout_id]
    assert len(tables_in_new) == 1
    assert tables_in_new[0]["name"] == "InArea"


@pytest.mark.anyio
async def test_copy_layout_no_tables_when_flags_false(client):
    """When both copy_tables and copy_areas are False, no tables are copied."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    source_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    r = await client.post(
        "/api/tables",
        json={"name": "T1", "capacity": 4, "x": 10.0, "y": 10.0, "table_type_id": tt_id, "layout_id": source_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={"room_id": room_id, "day_id": 2, "copy_tables": False, "copy_areas": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    new_layout_id = r.json()["id"]

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    tables_in_new = [t for t in r.json() if t["layout_id"] == new_layout_id]
    assert tables_in_new == []
