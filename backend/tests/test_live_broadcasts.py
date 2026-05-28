"""Broadcast wiring tests: assert mutation routes publish live events.

Each test subscribes to live_bus directly (no HTTP streaming), performs
a mutation via the HTTP test client, then reads from the queue immediately.
These tests require a running PostgreSQL instance (they use the client fixture).
"""

from __future__ import annotations

from app.live import live_bus
from tests.helpers import (
    ADMIN_HEADERS,
    TABLE_TYPE_PAYLOAD,
    _create_layout_prerequisites,
    _post_registration,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _table_prerequisites(client) -> tuple[str, str]:
    """Return (layout_id, table_type_id) after creating all prerequisites."""
    layout_id = await _create_layout_prerequisites(client)
    r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    return layout_id, r.json()["id"]


async def _create_table(client) -> str:
    layout_id, tt_id = await _table_prerequisites(client)
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "capacity": 6, "x": 0.0, "y": 0.0, "table_type_id": tt_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    return r.json()["id"]


async def _registration_with_token(client) -> tuple[str, str]:
    """Return (registration_id, check_in_token)."""
    r = await _post_registration(client)
    assert r.status_code == 201
    reg_id = r.json()["id"]
    r = await client.get(f"/api/registrations/{reg_id}", headers=ADMIN_HEADERS)
    return reg_id, r.json()["check_in_token"]


# ---------------------------------------------------------------------------
# Check-in broadcasts
# ---------------------------------------------------------------------------


async def test_check_in_publishes_check_in_event(client):
    reg_id, token = await _registration_with_token(client)

    async with live_bus.subscribe() as queue:
        r = await client.post(f"/api/check-in/{reg_id}", json={"token": token, "issue_strap": False})
        assert r.status_code == 200
        assert not r.json()["already_checked_in"]
        event = queue.get_nowait()

    assert event.topic == "check_in"
    assert event.action == "updated"
    assert event.scope.registration_id == reg_id


async def test_check_in_no_event_when_already_checked_in(client):
    reg_id, token = await _registration_with_token(client)

    # First scan — checks in and publishes.
    await client.post(f"/api/check-in/{reg_id}", json={"token": token, "issue_strap": False})

    async with live_bus.subscribe() as queue:
        r = await client.post(f"/api/check-in/{reg_id}", json={"token": token, "issue_strap": False})
        assert r.json()["already_checked_in"] is True
        assert queue.empty()


# ---------------------------------------------------------------------------
# Registration create broadcasts
# ---------------------------------------------------------------------------


async def test_public_create_registration_publishes_event(client):
    async with live_bus.subscribe() as queue:
        r = await _post_registration(client)
        assert r.status_code == 201
        event = queue.get_nowait()

    assert event.topic == "registration"
    assert event.action == "created"
    assert event.scope.registration_id == r.json()["id"]


async def test_admin_create_registration_publishes_event(client):
    from tests.helpers import _create_event

    evt = await _create_event(client)

    # Create a person first.
    r = await client.post(
        "/api/people",
        json={"name": "Admin Person", "email": "ap@example.com", "phone": "+32499111111"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    person_id = r.json()["id"]

    async with live_bus.subscribe() as queue:
        r = await client.post(
            "/api/registrations/admin",
            json={"person_id": person_id, "event_id": evt["id"], "guest_count": 1, "pre_orders": []},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 201
        event = queue.get_nowait()

    assert event.topic == "registration"
    assert event.action == "created"


# ---------------------------------------------------------------------------
# Registration update broadcasts
# ---------------------------------------------------------------------------


async def test_update_table_id_publishes_seating_event(client):
    reg_id, _ = await _registration_with_token(client)
    table_id = await _create_table(client)

    async with live_bus.subscribe() as queue:
        r = await client.put(
            f"/api/registrations/{reg_id}",
            json={"table_id": table_id},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 200
        event = queue.get_nowait()

    assert event.topic == "seating"
    assert event.scope.registration_id == reg_id
    assert event.scope.table_id == table_id


async def test_update_status_publishes_registration_event(client):
    reg_id, _ = await _registration_with_token(client)

    async with live_bus.subscribe() as queue:
        r = await client.put(
            f"/api/registrations/{reg_id}",
            json={"status": "confirmed"},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 200
        event = queue.get_nowait()

    assert event.topic == "registration"
    assert event.action == "updated"


async def test_update_pre_orders_quantity_publishes_order_event(client):
    reg_id, _ = await _registration_with_token(client)

    async with live_bus.subscribe() as queue:
        r = await client.put(
            f"/api/registrations/{reg_id}",
            json={
                "pre_orders": [
                    {"product_id": "p1", "name": "Bottle", "quantity": 2, "price": 65.0, "category": "champagne"}
                ]
            },
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 200
        event = queue.get_nowait()

    assert event.topic == "order"


async def test_update_pre_orders_delivery_publishes_delivery_event(client):
    reg_id, _ = await _registration_with_token(client)

    # First set a pre-order.
    await client.put(
        f"/api/registrations/{reg_id}",
        json={
            "pre_orders": [
                {"product_id": "p1", "name": "Bottle", "quantity": 2, "price": 65.0, "category": "champagne"}
            ]
        },
        headers=ADMIN_HEADERS,
    )

    async with live_bus.subscribe() as queue:
        r = await client.put(
            f"/api/registrations/{reg_id}",
            json={
                "pre_orders": [
                    {
                        "product_id": "p1",
                        "name": "Bottle",
                        "quantity": 2,
                        "price": 65.0,
                        "category": "champagne",
                        "delivered_quantity": 1,
                    }
                ]
            },
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 200
        event = queue.get_nowait()

    assert event.topic == "delivery"


# ---------------------------------------------------------------------------
# Registration delete broadcasts
# ---------------------------------------------------------------------------


async def test_delete_registration_publishes_event(client):
    reg_id, _ = await _registration_with_token(client)

    async with live_bus.subscribe() as queue:
        r = await client.delete(f"/api/registrations/{reg_id}", headers=ADMIN_HEADERS)
        assert r.status_code == 204
        event = queue.get_nowait()

    assert event.topic == "registration"
    assert event.action == "deleted"
    assert event.scope.registration_id == reg_id


# ---------------------------------------------------------------------------
# Table broadcasts
# ---------------------------------------------------------------------------


async def test_create_table_publishes_seating_event(client):
    layout_id, tt_id = await _table_prerequisites(client)

    async with live_bus.subscribe() as queue:
        r = await client.post(
            "/api/tables",
            json={"name": "T1", "capacity": 6, "x": 0.0, "y": 0.0, "table_type_id": tt_id, "layout_id": layout_id},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 201
        event = queue.get_nowait()

    assert event.topic == "seating"
    assert event.action == "created"
    assert event.scope.table_id == r.json()["id"]


async def test_update_table_publishes_seating_event(client):
    table_id = await _create_table(client)

    async with live_bus.subscribe() as queue:
        r = await client.put(f"/api/tables/{table_id}", json={"capacity": 8}, headers=ADMIN_HEADERS)
        assert r.status_code == 200
        event = queue.get_nowait()

    assert event.topic == "seating"
    assert event.action == "updated"
    assert event.scope.table_id == table_id


async def test_delete_table_publishes_seating_event(client):
    table_id = await _create_table(client)

    async with live_bus.subscribe() as queue:
        r = await client.delete(f"/api/tables/{table_id}", headers=ADMIN_HEADERS)
        assert r.status_code == 204
        event = queue.get_nowait()

    assert event.topic == "seating"
    assert event.action == "deleted"
    assert event.scope.table_id == table_id
