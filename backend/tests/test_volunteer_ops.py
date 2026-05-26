"""Tests for volunteer operational endpoints."""

from __future__ import annotations

import pytest

from tests.helpers import (
    ADMIN_HEADERS,
    ROOM_PAYLOAD,
    TABLE_TYPE_PAYLOAD,
    VENUE_PAYLOAD,
    _post_registration,
)


async def _create_table(client, *, name: str) -> str:
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    layout_id = r.json()["id"]
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    table_type_id = r.json()["id"]
    r = await client.post(
        "/api/tables",
        json={"name": name, "capacity": 6, "table_type_id": table_type_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    return r.json()["id"]


@pytest.mark.anyio
async def test_volunteer_registrations_support_table_lookup_and_hide_pii(client, volunteer_client):
    registration = await _post_registration(client, path="/api/registrations", notes="No sugar")
    assert registration.status_code == 201
    registration_id = registration.json()["id"]
    table_id = await _create_table(client, name="Table A")

    r = await client.put(
        f"/api/registrations/{registration_id}",
        json={"table_id": table_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await volunteer_client.get("/api/volunteer/registrations", params={"q": "Table A"})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == registration_id
    assert row["table_id"] == table_id
    assert row["table_name"] == "Table A"
    assert row["notes"] == "No sugar"
    assert "pre_orders" in row
    assert "address" not in row
    assert "national_register_number" not in row
    assert "eid_document_number" not in row
    assert "email" not in row
    assert "phone" not in row
