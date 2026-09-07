"""Broadcast wiring tests: assert mutation routes publish live events.

Each test subscribes to live_bus directly (no HTTP streaming), performs a
mutation via the HTTP test client, then awaits the event on the queue. Since
#932, mutation routes only send a transactional Postgres NOTIFY
(notify_live_event) — delivery into live_bus goes through the real
cross-worker LISTEN relay (app.live.listener, started for the whole test
session by the pg_live_listener fixture in conftest.py), which is genuinely
asynchronous even within one process, so these await with a timeout rather
than assuming the event is already queued the instant the HTTP call returns.

Several tests create prerequisites (a registration, a table) via HTTP *before*
subscribing. Because delivery is now asynchronous, that prerequisite's own
NOTIFY can still be in flight when subscribe() starts and land in the queue
ahead of the event under test — so _get_event() takes a predicate and drains
non-matching events instead of returning the first one (see PR #1011 review).

These tests require a running PostgreSQL instance (they use the client fixture).
"""

from __future__ import annotations

import asyncio

from app.live import live_bus
from tests.helpers import (
    ADMIN_HEADERS,
    TABLE_TYPE_PAYLOAD,
    _create_event,
    _create_layout_prerequisites,
    _create_venue,
    _post_registration,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_event(queue, *, matches=lambda event: True):
    """Await the next event satisfying *matches*, discarding earlier ones.

    The 5s timeout budget is shared across every read in one call, not
    restarted each time a non-matching event is skipped — see module
    docstring for why non-matching events can show up at all.
    """
    deadline = asyncio.get_running_loop().time() + 5.0
    while True:
        remaining = deadline - asyncio.get_running_loop().time()
        event = await asyncio.wait_for(queue.get(), timeout=max(remaining, 0.0))
        if matches(event):
            return event


async def _table_prerequisites(client) -> tuple[str, str]:
    """Return (layout_id, table_type_id) after creating all prerequisites."""
    layout_id = await _create_layout_prerequisites(client)
    venue_id = await _create_venue(client)
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    return layout_id, r.json()["id"]


async def _create_table(client) -> str:
    layout_id, tt_id = await _table_prerequisites(client)
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "x": 0.0, "y": 0.0, "table_type_id": tt_id, "layout_id": layout_id},
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


async def _registration_with_product(client) -> tuple[str, str]:
    event = await _create_event(client)
    product = await client.post(
        "/api/products",
        json={
            "event_id": event["id"],
            "name": "Bottle",
            "price": "65.00",
            "category": "champagne",
        },
        headers=ADMIN_HEADERS,
    )
    assert product.status_code == 201
    registration = await _post_registration(client, event=event)
    assert registration.status_code == 201
    return registration.json()["id"], product.json()["id"]


# ---------------------------------------------------------------------------
# Check-in broadcasts
# ---------------------------------------------------------------------------


async def test_check_in_publishes_check_in_event(client):
    reg_id, token = await _registration_with_token(client)

    async with live_bus.subscribe() as queue:
        r = await client.post(f"/api/check-in/{reg_id}", json={"token": token, "issue_strap": False})
        assert r.status_code == 200
        assert not r.json()["already_checked_in"]
        event = await _get_event(queue, matches=lambda e: e.topic == "check_in")

    assert event.action == "updated"
    assert event.scope.registration_id == reg_id


async def test_check_in_no_event_when_already_checked_in(client):
    reg_id, token = await _registration_with_token(client)

    async with live_bus.subscribe() as queue:
        # First scan — checks in and publishes; drain it (and any still-in-flight
        # notification from the registration created above it) before asserting
        # the second scan below produces nothing.
        await client.post(f"/api/check-in/{reg_id}", json={"token": token, "issue_strap": False})
        await _get_event(queue, matches=lambda e: e.topic == "check_in")

        # Second scan — already checked in, no notify sent.
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
        event = await _get_event(queue)

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
            json={"person_id": person_id, "event_id": evt["id"], "guest_count": 1, "order_items": []},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 201
        event = await _get_event(queue)

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
        event = await _get_event(queue, matches=lambda e: e.topic == "seating" and e.scope.registration_id == reg_id)

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
        await _get_event(queue, matches=lambda e: e.topic == "registration" and e.action == "updated")


async def test_update_order_items_quantity_publishes_order_event(client):
    reg_id, product_id = await _registration_with_product(client)

    async with live_bus.subscribe() as queue:
        r = await client.put(
            f"/api/registrations/{reg_id}",
            json={"order_items": [{"product_id": product_id, "quantity": 2}]},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 200
        await _get_event(queue, matches=lambda e: e.topic == "order")


async def test_update_order_items_delivery_publishes_delivery_event(client):
    reg_id, product_id = await _registration_with_product(client)

    # First set an order.
    order = await client.put(
        f"/api/registrations/{reg_id}",
        json={"order_items": [{"product_id": product_id, "quantity": 2}]},
        headers=ADMIN_HEADERS,
    )
    assert order.status_code == 200

    async with live_bus.subscribe() as queue:
        r = await client.put(
            f"/api/volunteer/registrations/{reg_id}",
            json={
                "order_items": [
                    {
                        "product_id": product_id,
                        "delivered_quantity": 1,
                    }
                ]
            },
        )
        assert r.status_code == 200
        await _get_event(queue, matches=lambda e: e.topic == "delivery")


# ---------------------------------------------------------------------------
# Registration delete broadcasts
# ---------------------------------------------------------------------------


async def test_delete_registration_publishes_event(client):
    reg_id, _ = await _registration_with_token(client)

    async with live_bus.subscribe() as queue:
        r = await client.delete(f"/api/registrations/{reg_id}", headers=ADMIN_HEADERS)
        assert r.status_code == 204
        event = await _get_event(queue, matches=lambda e: e.topic == "registration" and e.action == "deleted")

    assert event.scope.registration_id == reg_id


# ---------------------------------------------------------------------------
# Table broadcasts
# ---------------------------------------------------------------------------


async def test_create_table_publishes_seating_event(client):
    layout_id, tt_id = await _table_prerequisites(client)

    async with live_bus.subscribe() as queue:
        r = await client.post(
            "/api/tables",
            json={"name": "T1", "x": 0.0, "y": 0.0, "table_type_id": tt_id, "layout_id": layout_id},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 201
        event = await _get_event(queue)

    assert event.topic == "seating"
    assert event.action == "created"
    assert event.scope.table_id == r.json()["id"]


async def test_update_table_publishes_seating_event(client):
    table_id = await _create_table(client)

    async with live_bus.subscribe() as queue:
        r = await client.put(f"/api/tables/{table_id}", json={"name": "Renamed"}, headers=ADMIN_HEADERS)
        assert r.status_code == 200
        event = await _get_event(queue, matches=lambda e: e.topic == "seating" and e.action == "updated")

    assert event.scope.table_id == table_id


async def test_delete_table_publishes_seating_event(client):
    table_id = await _create_table(client)

    async with live_bus.subscribe() as queue:
        r = await client.delete(f"/api/tables/{table_id}", headers=ADMIN_HEADERS)
        assert r.status_code == 204
        event = await _get_event(queue, matches=lambda e: e.topic == "seating" and e.action == "deleted")

    assert event.scope.table_id == table_id
