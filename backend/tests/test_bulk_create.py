"""Tests for bulk/import admin write endpoints and idempotency (#837).

Covers the REST surface (``POST /api/<resource>/bulk``) for rooms, table
types, tables, and layouts: happy-path creation, atomic rollback on a
partial failure, and idempotency-key replay/conflict semantics. See
``test_mcp_admin_bulk_create.py`` for the equivalent MCP-surface coverage.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import IdempotencyKey, Layout, Room, Table, TableType
from tests.helpers import ADMIN_HEADERS, ROOM_PAYLOAD, TABLE_TYPE_PAYLOAD, VENUE_PAYLOAD


async def _create_venue(client) -> str:
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    return r.json()["id"]


async def _create_room(client, venue_id: str) -> str:
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_bulk_create_rooms_happy_path(client):
    venue_id = await _create_venue(client)
    items = [{**ROOM_PAYLOAD, "name": f"Room {i}", "venue_id": venue_id} for i in range(3)]

    r = await client.post("/api/rooms/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    data = r.json()
    assert [room["name"] for room in data["items"]] == ["Room 0", "Room 1", "Room 2"]
    assert all(room["venue_id"] == venue_id for room in data["items"])
    assert len({room["id"] for room in data["items"]}) == 3

    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert len(r.json()) == 3


@pytest.mark.anyio
async def test_bulk_create_rooms_rolls_back_on_partial_failure(client, db_session):
    venue_id = await _create_venue(client)
    items = [
        {**ROOM_PAYLOAD, "name": "Room OK", "venue_id": venue_id},
        {**ROOM_PAYLOAD, "name": "Room Bad", "venue_id": "venue-missing"},
    ]

    r = await client.post("/api/rooms/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 404

    result = await db_session.execute(select(Room))
    assert result.scalars().all() == []


@pytest.mark.anyio
async def test_bulk_create_rooms_rejects_empty_batch(client):
    r = await client.post("/api/rooms/bulk", json={"items": []}, headers=ADMIN_HEADERS)
    assert r.status_code == 422


@pytest.mark.anyio
async def test_bulk_create_rooms_rejects_batch_over_limit(client):
    venue_id = await _create_venue(client)
    items = [{**ROOM_PAYLOAD, "name": f"Room {i}", "venue_id": venue_id} for i in range(201)]
    r = await client.post("/api/rooms/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 422


@pytest.mark.anyio
async def test_bulk_create_rooms_idempotency_key_replays_result(client):
    venue_id = await _create_venue(client)
    body = {"items": [{**ROOM_PAYLOAD, "venue_id": venue_id}], "idempotency_key": "retry-key-1"}

    r1 = await client.post("/api/rooms/bulk", json=body, headers=ADMIN_HEADERS)
    assert r1.status_code == 201
    first = r1.json()

    r2 = await client.post("/api/rooms/bulk", json=body, headers=ADMIN_HEADERS)
    assert r2.status_code == 201
    assert r2.json() == first

    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_bulk_create_rooms_idempotency_key_reused_with_different_payload_conflicts(client):
    venue_id = await _create_venue(client)
    r1 = await client.post(
        "/api/rooms/bulk",
        json={"items": [{**ROOM_PAYLOAD, "name": "Room A", "venue_id": venue_id}], "idempotency_key": "shared-key"},
        headers=ADMIN_HEADERS,
    )
    assert r1.status_code == 201

    r2 = await client.post(
        "/api/rooms/bulk",
        json={"items": [{**ROOM_PAYLOAD, "name": "Room B", "venue_id": venue_id}], "idempotency_key": "shared-key"},
        headers=ADMIN_HEADERS,
    )
    assert r2.status_code == 409

    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_bulk_create_rooms_failed_attempt_does_not_consume_idempotency_key(client):
    """A validation failure shouldn't burn the key — a corrected retry with the
    same key must still go through rather than replaying a nonexistent result."""
    venue_id = await _create_venue(client)
    key = "retry-after-failure"

    r1 = await client.post(
        "/api/rooms/bulk",
        json={"items": [{**ROOM_PAYLOAD, "venue_id": "venue-missing"}], "idempotency_key": key},
        headers=ADMIN_HEADERS,
    )
    assert r1.status_code == 404

    r2 = await client.post(
        "/api/rooms/bulk",
        json={"items": [{**ROOM_PAYLOAD, "venue_id": venue_id}], "idempotency_key": key},
        headers=ADMIN_HEADERS,
    )
    assert r2.status_code == 201

    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_bulk_create_rooms_stores_idempotency_key_scoped_to_rooms(client, db_session):
    venue_id = await _create_venue(client)
    await client.post(
        "/api/rooms/bulk",
        json={"items": [{**ROOM_PAYLOAD, "venue_id": venue_id}], "idempotency_key": "scoped-key"},
        headers=ADMIN_HEADERS,
    )

    result = await db_session.execute(select(IdempotencyKey).where(IdempotencyKey.key == "scoped-key"))
    row = result.scalar_one()
    assert row.scope == "rooms.bulk_create"


@pytest.mark.anyio
async def test_bulk_create_idempotency_key_isolated_across_scopes(client, db_session):
    """The same key value reused for a different resource type is a distinct
    (scope, key) row, not a collision — scope is part of the identity."""
    venue_id = await _create_venue(client)

    r1 = await client.post(
        "/api/rooms/bulk",
        json={"items": [{**ROOM_PAYLOAD, "venue_id": venue_id}], "idempotency_key": "cross-scope-key"},
        headers=ADMIN_HEADERS,
    )
    assert r1.status_code == 201

    r2 = await client.post(
        "/api/table-types/bulk",
        json={"items": [{**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}], "idempotency_key": "cross-scope-key"},
        headers=ADMIN_HEADERS,
    )
    assert r2.status_code == 201

    result = await db_session.execute(select(IdempotencyKey).where(IdempotencyKey.key == "cross-scope-key"))
    rows = result.scalars().all()
    assert {row.scope for row in rows} == {"rooms.bulk_create", "table_types.bulk_create"}


# ---------------------------------------------------------------------------
# Table types
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_bulk_create_table_types_happy_path(client):
    venue_id = await _create_venue(client)
    items = [{**TABLE_TYPE_PAYLOAD, "name": f"Type {i}", "venue_id": venue_id} for i in range(2)]

    r = await client.post("/api/table-types/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    assert [tt["name"] for tt in r.json()["items"]] == ["Type 0", "Type 1"]

    r = await client.get("/api/table-types", headers=ADMIN_HEADERS)
    assert len(r.json()) == 2


@pytest.mark.anyio
async def test_bulk_create_table_types_rolls_back_on_partial_failure(client, db_session):
    venue_id = await _create_venue(client)
    items = [
        {**TABLE_TYPE_PAYLOAD, "name": "Type OK", "venue_id": venue_id},
        {**TABLE_TYPE_PAYLOAD, "name": "Type Bad", "venue_id": "venue-missing"},
    ]

    r = await client.post("/api/table-types/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 404

    result = await db_session.execute(select(TableType))
    assert result.scalars().all() == []


@pytest.mark.anyio
async def test_bulk_create_table_types_normalises_round_dimensions(client):
    """Bulk creation must apply the same shape-dimension normalisation as a single create."""
    venue_id = await _create_venue(client)
    items = [{**TABLE_TYPE_PAYLOAD, "venue_id": venue_id, "shape": "round", "width_m": 1.5, "length_m": 0.9}]

    r = await client.post("/api/table-types/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    tt = r.json()["items"][0]
    assert tt["width_m"] == tt["length_m"] == 1.5


@pytest.mark.anyio
async def test_bulk_create_table_types_idempotency_key_replays_result(client):
    venue_id = await _create_venue(client)
    body = {"items": [{**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}], "idempotency_key": "tt-retry-key"}

    r1 = await client.post("/api/table-types/bulk", json=body, headers=ADMIN_HEADERS)
    assert r1.status_code == 201

    r2 = await client.post("/api/table-types/bulk", json=body, headers=ADMIN_HEADERS)
    assert r2.status_code == 201
    assert r2.json() == r1.json()

    r = await client.get("/api/table-types", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


async def _create_table_type(client, venue_id: str) -> str:
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    return r.json()["id"]


async def _create_layout(client, room_id: str, day_id: int = 1) -> str:
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": day_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    return r.json()["id"]


@pytest.mark.anyio
async def test_bulk_create_tables_happy_path(client):
    venue_id = await _create_venue(client)
    room_id = await _create_room(client, venue_id)
    table_type_id = await _create_table_type(client, venue_id)
    layout_id = await _create_layout(client, room_id)

    items = [
        {"name": f"Table {i}", "capacity": 4, "table_type_id": table_type_id, "layout_id": layout_id} for i in range(4)
    ]
    r = await client.post("/api/tables/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    data = r.json()
    assert [t["name"] for t in data["items"]] == [f"Table {i}" for i in range(4)]
    assert all(t["registration_ids"] == [] for t in data["items"])

    r = await client.get("/api/tables", params={"layout_id": layout_id}, headers=ADMIN_HEADERS)
    assert len(r.json()) == 4


@pytest.mark.anyio
async def test_bulk_create_tables_rolls_back_on_partial_failure(client, db_session):
    venue_id = await _create_venue(client)
    room_id = await _create_room(client, venue_id)
    table_type_id = await _create_table_type(client, venue_id)
    layout_id = await _create_layout(client, room_id)

    items = [
        {"name": "Table OK", "capacity": 4, "table_type_id": table_type_id, "layout_id": layout_id},
        {"name": "Table Bad", "capacity": 4, "table_type_id": table_type_id, "layout_id": "layout-missing"},
    ]
    r = await client.post("/api/tables/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 404

    result = await db_session.execute(select(Table))
    assert result.scalars().all() == []


@pytest.mark.anyio
async def test_bulk_create_tables_idempotency_key_replays_result(client):
    venue_id = await _create_venue(client)
    room_id = await _create_room(client, venue_id)
    table_type_id = await _create_table_type(client, venue_id)
    layout_id = await _create_layout(client, room_id)

    body = {
        "items": [{"name": "Table A", "capacity": 4, "table_type_id": table_type_id, "layout_id": layout_id}],
        "idempotency_key": "table-retry-key",
    }
    r1 = await client.post("/api/tables/bulk", json=body, headers=ADMIN_HEADERS)
    assert r1.status_code == 201

    r2 = await client.post("/api/tables/bulk", json=body, headers=ADMIN_HEADERS)
    assert r2.status_code == 201
    assert r2.json() == r1.json()

    r = await client.get("/api/tables", params={"layout_id": layout_id}, headers=ADMIN_HEADERS)
    assert len(r.json()) == 1


# ---------------------------------------------------------------------------
# Layouts
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_bulk_create_layouts_happy_path(client):
    venue_id = await _create_venue(client)
    room_a = await _create_room(client, venue_id)
    room_b = await _create_room(client, venue_id)

    items = [{"room_id": room_a, "day_id": 1}, {"room_id": room_b, "day_id": 1}]
    r = await client.post("/api/layouts/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    assert {lay["room_id"] for lay in r.json()["items"]} == {room_a, room_b}

    r = await client.get("/api/layouts", headers=ADMIN_HEADERS)
    assert len(r.json()) == 2


@pytest.mark.anyio
async def test_bulk_create_layouts_rolls_back_on_partial_failure(client, db_session):
    venue_id = await _create_venue(client)
    room_id = await _create_room(client, venue_id)

    items = [{"room_id": room_id, "day_id": 1}, {"room_id": "room-missing", "day_id": 1}]
    r = await client.post("/api/layouts/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 404

    result = await db_session.execute(select(Layout))
    assert result.scalars().all() == []


@pytest.mark.anyio
async def test_bulk_create_layouts_rejects_duplicate_within_batch(client, db_session):
    venue_id = await _create_venue(client)
    room_id = await _create_room(client, venue_id)

    items = [{"room_id": room_id, "day_id": 1}, {"room_id": room_id, "day_id": 1}]
    r = await client.post("/api/layouts/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 409

    result = await db_session.execute(select(Layout))
    assert result.scalars().all() == []


@pytest.mark.anyio
async def test_bulk_create_layouts_rejects_duplicate_against_existing(client, db_session):
    venue_id = await _create_venue(client)
    room_id = await _create_room(client, venue_id)
    await _create_layout(client, room_id, day_id=1)

    items = [{"room_id": room_id, "day_id": 2}, {"room_id": room_id, "day_id": 1}]
    r = await client.post("/api/layouts/bulk", json={"items": items}, headers=ADMIN_HEADERS)
    assert r.status_code == 409

    result = await db_session.execute(select(Layout))
    # Only the pre-existing layout survives — the batch's own valid item never committed.
    assert len(result.scalars().all()) == 1


@pytest.mark.anyio
async def test_bulk_create_layouts_idempotency_key_replays_result(client):
    venue_id = await _create_venue(client)
    room_id = await _create_room(client, venue_id)

    body = {"items": [{"room_id": room_id, "day_id": 1}], "idempotency_key": "layout-retry-key"}
    r1 = await client.post("/api/layouts/bulk", json=body, headers=ADMIN_HEADERS)
    assert r1.status_code == 201

    r2 = await client.post("/api/layouts/bulk", json=body, headers=ADMIN_HEADERS)
    assert r2.status_code == 201
    assert r2.json() == r1.json()

    r = await client.get("/api/layouts", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1


@pytest.mark.anyio
@pytest.mark.parametrize(
    "path",
    ["/api/rooms/bulk", "/api/table-types/bulk", "/api/tables/bulk", "/api/layouts/bulk"],
)
async def test_bulk_create_endpoints_require_admin(unauth_client, path):
    r = await unauth_client.post(path, json={"items": []})
    assert r.status_code == 401
