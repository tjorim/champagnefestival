"""Tests for the event-scoped products API and their use in registration pre-orders."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event

PRODUCT_PAYLOAD = {"name": "Bottle of Champagne", "price": "25.00", "category": "champagne"}


async def _create_product(client, event_id: str, **overrides):
    payload = {**PRODUCT_PAYLOAD, "event_id": event_id, **overrides}
    r = await client.post("/api/products", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.anyio
async def test_product_crud(client):
    event = await _create_event(client)

    r = await client.post(
        "/api/products",
        json={**PRODUCT_PAYLOAD, "event_id": event["id"]},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    product = r.json()
    assert product["name"] == "Bottle of Champagne"
    assert product["price"] == "25.00"
    assert product["event_id"] == event["id"]
    assert product["active"] is True
    product_id = product["id"]

    r = await client.get("/api/products", params={"event_id": event["id"]}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert any(p["id"] == product_id for p in r.json())

    r = await client.get(f"/api/products/{product_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["name"] == "Bottle of Champagne"

    r = await client.put(f"/api/products/{product_id}", json={"price": "30.00"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["price"] == "30.00"
    assert r.json()["name"] == "Bottle of Champagne"  # untouched fields survive a partial update

    r = await client.delete(f"/api/products/{product_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get(f"/api/products/{product_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_product_requires_admin(unauth_client):
    r = await unauth_client.post("/api/products", json={**PRODUCT_PAYLOAD, "event_id": "evt-x"})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_product_create_requires_existing_event(client):
    r = await client.post(
        "/api/products",
        json={**PRODUCT_PAYLOAD, "event_id": "nonexistent"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_product_get_not_found(client):
    r = await client.get("/api/products/nonexistent", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_product_update_not_found(client):
    r = await client.put("/api/products/nonexistent", json={"price": "10.00"}, headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_product_archive_via_active_toggle(client):
    event = await _create_event(client)
    product = await _create_product(client, event["id"])

    r = await client.put(f"/api/products/{product['id']}", json={"active": False}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["active"] is False


@pytest.mark.anyio
async def test_event_out_embeds_only_active_products(client):
    event = await _create_event(client)
    active_product = await _create_product(client, event["id"], name="Active Bottle")
    inactive_product = await _create_product(client, event["id"], name="Archived Bottle", active=False)

    r = await client.get(f"/api/events/{event['id']}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    product_ids = [p["id"] for p in r.json()["products"]]
    assert active_product["id"] in product_ids
    assert inactive_product["id"] not in product_ids


@pytest.mark.anyio
async def test_registration_resolves_pre_order_against_real_product(client):
    """The server must snapshot name/price/category from the real product, ignoring
    whatever the client sends for those fields — a client can only choose product_id
    and quantity."""
    event = await _create_event(client)
    product = await _create_product(client, event["id"], name="Bottle of Champagne", price="25.00")

    r = await client.post(
        "/api/registrations",
        json={
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "phone": "+32499000000",
            "event_id": event["id"],
            "guest_count": 1,
            "pre_orders": [
                {
                    "product_id": product["id"],
                    "quantity": 2,
                    # An attacker-controlled client might also try to smuggle these in;
                    # pydantic silently drops unknown fields, but assert the resolved
                    # order reflects the server's authoritative product data regardless.
                    "name": "Free Champagne",
                    "price": 0,
                    "category": "other",
                },
            ],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 201, r.text
    pre_orders = r.json()["pre_orders"]
    assert len(pre_orders) == 1
    assert pre_orders[0]["product_id"] == product["id"]
    assert pre_orders[0]["name"] == "Bottle of Champagne"
    assert pre_orders[0]["price"] == 25.0
    assert pre_orders[0]["category"] == "champagne"
    assert pre_orders[0]["quantity"] == 2


@pytest.mark.anyio
async def test_registration_rejects_unknown_product_id(client):
    event = await _create_event(client)

    r = await client.post(
        "/api/registrations",
        json={
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "phone": "+32499000000",
            "event_id": event["id"],
            "guest_count": 1,
            "pre_orders": [{"product_id": "does-not-exist", "quantity": 1}],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_registration_rejects_archived_product(client):
    event = await _create_event(client)
    product = await _create_product(client, event["id"], active=False)

    r = await client.post(
        "/api/registrations",
        json={
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "phone": "+32499000000",
            "event_id": event["id"],
            "guest_count": 1,
            "pre_orders": [{"product_id": product["id"], "quantity": 1}],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_registration_rejects_product_from_a_different_event(client):
    event_a = await _create_event(client, edition_id="edition-a", title="Event A")
    event_b = await _create_event(client, edition_id="edition-b", title="Event B")
    product_on_b = await _create_product(client, event_b["id"])

    r = await client.post(
        "/api/registrations",
        json={
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "phone": "+32499000000",
            "event_id": event_a["id"],
            "guest_count": 1,
            "pre_orders": [{"product_id": product_on_b["id"], "quantity": 1}],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_admin_registration_creation_also_resolves_pre_orders(client):
    event = await _create_event(client)
    product = await _create_product(client, event["id"], price="10.50")

    r = await client.post(
        "/api/people",
        json={"name": "Admin Person", "email": "ap@example.com", "phone": "+32499111111"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    person_id = r.json()["id"]

    r = await client.post(
        "/api/registrations/admin",
        json={
            "person_id": person_id,
            "event_id": event["id"],
            "guest_count": 1,
            "pre_orders": [{"product_id": product["id"], "quantity": 3, "price": 999}],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    pre_orders = r.json()["pre_orders"]
    assert pre_orders[0]["price"] == 10.5
    assert pre_orders[0]["quantity"] == 3


@pytest.mark.anyio
async def test_registration_allowed_for_walkin_event_with_active_product(client):
    """An event that doesn't require registration (walk-in) should still accept a
    registration from someone who wants to pre-order — e.g. a VIP package — even
    though showing up for the event itself needs no RSVP."""
    event = await _create_event(client, registration_required=False)
    product = await _create_product(client, event["id"])

    r = await client.post(
        "/api/registrations",
        json={
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "phone": "+32499000000",
            "event_id": event["id"],
            "guest_count": 1,
            "pre_orders": [{"product_id": product["id"], "quantity": 1}],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 201, r.text


@pytest.mark.anyio
async def test_registration_rejected_for_walkin_event_with_only_archived_products(client):
    """A walk-in event whose only products are archived has nothing left to offer,
    so it should reject registration the same as one with no products at all."""
    event = await _create_event(client, registration_required=False)
    await _create_product(client, event["id"], active=False)

    r = await client.post(
        "/api/registrations",
        json={
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "phone": "+32499000000",
            "event_id": event["id"],
            "guest_count": 1,
            "pre_orders": [],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "This event does not accept registrations."


@pytest.mark.anyio
async def test_deleting_product_does_not_alter_existing_registration_pre_orders(client):
    """pre_orders is a snapshot taken at order time, not a live reference — deleting
    the product afterward must not corrupt registrations already placed against it."""
    event = await _create_event(client)
    product = await _create_product(client, event["id"], name="Bottle", price="12.00")

    r = await client.post(
        "/api/registrations",
        json={
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "phone": "+32499000000",
            "event_id": event["id"],
            "guest_count": 1,
            "pre_orders": [{"product_id": product["id"], "quantity": 1}],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 201
    registration_id = r.json()["id"]

    r = await client.delete(f"/api/products/{product['id']}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get(f"/api/registrations/{registration_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    pre_orders = r.json()["pre_orders"]
    assert pre_orders[0]["name"] == "Bottle"
    assert pre_orders[0]["price"] == 12.0
