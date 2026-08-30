"""Tests for the event-scoped products API and their use in registration order items."""

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
async def test_registration_resolves_order_item_against_real_product(client):
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
            "order_items": [
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
    order_items = r.json()["order_items"]
    assert len(order_items) == 1
    assert order_items[0]["product_id"] == product["id"]
    assert order_items[0]["name"] == "Bottle of Champagne"
    assert order_items[0]["price"] == 25.0
    assert order_items[0]["category"] == "champagne"
    assert order_items[0]["quantity"] == 2


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
            "order_items": [{"product_id": "does-not-exist", "quantity": 1}],
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
            "order_items": [{"product_id": product["id"], "quantity": 1}],
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
            "order_items": [{"product_id": product_on_b["id"], "quantity": 1}],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_admin_registration_creation_also_resolves_order_items(client):
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
            "order_items": [{"product_id": product["id"], "quantity": 3, "price": 999}],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    order_items = r.json()["order_items"]
    assert order_items[0]["price"] == 10.5
    assert order_items[0]["quantity"] == 3


@pytest.mark.anyio
async def test_admin_registration_update_resolves_order_items_and_preserves_delivery(client):
    event = await _create_event(client)
    product = await _create_product(client, event["id"], name="Authoritative Bottle", price="17.50")
    registration = await _register(client, event["id"], [{"product_id": product["id"], "quantity": 3}])
    registration_id = registration.json()["id"]
    delivered = await client.put(
        f"/api/volunteer/registrations/{registration_id}",
        json={"order_items": [{"product_id": product["id"], "delivered_quantity": 2}]},
    )
    assert delivered.status_code == 200

    response = await client.put(
        f"/api/registrations/{registration_id}",
        json={
            "order_items": [
                {
                    "product_id": product["id"],
                    "quantity": 1,
                    "name": "Forged",
                    "price": 0,
                    "category": "other",
                }
            ]
        },
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    item = response.json()["order_items"][0]
    assert item["name"] == "Authoritative Bottle"
    assert item["price"] == 17.5
    assert item["category"] == "champagne"
    assert item["quantity"] == 1
    assert item["delivered_quantity"] == 1


@pytest.mark.anyio
async def test_admin_registration_update_rejects_unknown_product(client):
    event = await _create_event(client)
    product = await _create_product(client, event["id"])
    registration = await _register(client, event["id"], [{"product_id": product["id"], "quantity": 1}])

    response = await client.put(
        f"/api/registrations/{registration.json()['id']}",
        json={"order_items": [{"product_id": "does-not-exist", "quantity": 1}]},
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 400


@pytest.mark.anyio
async def test_registration_allowed_for_walkin_event_with_active_product(client):
    """An event that doesn't require registration (walk-in) should still accept a
    registration from someone who wants to order something — e.g. a VIP package —
    even though showing up for the event itself needs no RSVP."""
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
            "order_items": [{"product_id": product["id"], "quantity": 1}],
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
            "order_items": [],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "This event does not accept registrations."


async def _register(client, event_id: str, order_items: list[dict], **overrides):
    body = {
        "name": "Jean Dupont",
        "email": "jean@example.com",
        "phone": "+32499000000",
        "event_id": event_id,
        "guest_count": 1,
        "order_items": order_items,
        "notes": "",
        "honeypot": "",
        "form_start_time": "",
        **overrides,
    }
    return await client.post("/api/registrations", json=body)


@pytest.mark.anyio
async def test_product_can_be_marked_required(client):
    event = await _create_event(client)
    product = await _create_product(client, event["id"], required=True)
    assert product["required"] is True

    r = await client.put(f"/api/products/{product['id']}", json={"required": False}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["required"] is False


@pytest.mark.anyio
async def test_registration_rejects_optional_product_without_required_one(client):
    """A VIP entry ticket (required) must be in the order before an optional
    add-on (an extra bottle of champagne) can be."""
    event = await _create_event(client)
    await _create_product(client, event["id"], name="VIP Entry", price="50.00", required=True)
    extra_bottle = await _create_product(client, event["id"], name="Extra Bottle", price="30.00")

    r = await _register(client, event["id"], [{"product_id": extra_bottle["id"], "quantity": 1}])
    assert r.status_code == 400
    assert "required product" in r.json()["detail"]


@pytest.mark.anyio
async def test_registration_allows_optional_product_alongside_required_one(client):
    event = await _create_event(client)
    entry = await _create_product(client, event["id"], name="VIP Entry", price="50.00", required=True)
    extra_bottle = await _create_product(client, event["id"], name="Extra Bottle", price="30.00")

    r = await _register(
        client,
        event["id"],
        [
            {"product_id": entry["id"], "quantity": 1},
            {"product_id": extra_bottle["id"], "quantity": 2},
        ],
    )
    assert r.status_code == 201, r.text
    order_items = r.json()["order_items"]
    assert {item["product_id"] for item in order_items} == {entry["id"], extra_bottle["id"]}


@pytest.mark.anyio
async def test_registration_allows_required_product_alone(client):
    event = await _create_event(client)
    entry = await _create_product(client, event["id"], name="VIP Entry", price="50.00", required=True)

    r = await _register(client, event["id"], [{"product_id": entry["id"], "quantity": 1}])
    assert r.status_code == 201, r.text


@pytest.mark.anyio
async def test_events_without_required_products_are_unaffected(client):
    """An event with only optional products (e.g. a plain VIP package) keeps working
    exactly as before — the required-product rule only kicks in once an event
    actually has a required product configured."""
    event = await _create_event(client)
    vip_package = await _create_product(client, event["id"], name="VIP Package")

    r = await _register(client, event["id"], [{"product_id": vip_package["id"], "quantity": 1}])
    assert r.status_code == 201, r.text


@pytest.mark.anyio
async def test_admin_registration_creation_also_enforces_required_product(client):
    event = await _create_event(client)
    await _create_product(client, event["id"], name="VIP Entry", price="50.00", required=True)
    extra_bottle = await _create_product(client, event["id"], name="Extra Bottle", price="30.00")

    r = await client.post(
        "/api/people",
        json={"name": "Admin Person", "email": "ap2@example.com", "phone": "+32499111112"},
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
            "order_items": [{"product_id": extra_bottle["id"], "quantity": 1}],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_product_bundle_requires_both_fields_together(client):
    event = await _create_event(client)
    bottle = await _create_product(client, event["id"], name="Bottle")

    r = await client.post(
        "/api/products",
        json={**PRODUCT_PAYLOAD, "event_id": event["id"], "included_product_id": bottle["id"]},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422  # included_per_guests missing

    r = await client.post(
        "/api/products",
        json={**PRODUCT_PAYLOAD, "event_id": event["id"], "included_per_guests": 2},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422  # included_product_id missing


@pytest.mark.anyio
async def test_product_bundle_rejects_self_reference(client):
    event = await _create_event(client)
    table = await _create_product(client, event["id"], name="VIP Table")

    r = await client.put(
        f"/api/products/{table['id']}",
        json={"included_product_id": table["id"], "included_per_guests": 2},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_product_bundle_rejects_cross_event_target(client):
    event_a = await _create_event(client, edition_id="edition-bundle-a", title="Event A")
    event_b = await _create_event(client, edition_id="edition-bundle-b", title="Event B")
    bottle_on_b = await _create_product(client, event_b["id"], name="Bottle")

    r = await client.post(
        "/api/products",
        json={
            **PRODUCT_PAYLOAD,
            "event_id": event_a["id"],
            "name": "VIP Table",
            "included_product_id": bottle_on_b["id"],
            "included_per_guests": 2,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_product_bundle_rejects_chaining(client):
    """Only single-level bundles are supported: the included product cannot
    itself bundle another product."""
    event = await _create_event(client)
    base = await _create_product(client, event["id"], name="Base")
    middle = await _create_product(
        client,
        event["id"],
        name="Middle",
        included_product_id=base["id"],
        included_per_guests=1,
    )

    r = await client.post(
        "/api/products",
        json={
            **PRODUCT_PAYLOAD,
            "event_id": event["id"],
            "name": "Top",
            "included_product_id": middle["id"],
            "included_per_guests": 1,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_registration_computes_included_bundle_quantity(client):
    """A VIP table (required) includes one bottle of champagne per two guests,
    computed automatically from the registration's guest count."""
    event = await _create_event(client)
    bottle = await _create_product(client, event["id"], name="Champagne Bottle", price="65.00")
    table = await _create_product(
        client,
        event["id"],
        name="VIP Table",
        price="200.00",
        required=True,
        included_product_id=bottle["id"],
        included_per_guests=2,
    )

    r = await _register(
        client,
        event["id"],
        [{"product_id": table["id"], "quantity": 1}],
        guest_count=6,
    )
    assert r.status_code == 201, r.text
    order_items = r.json()["order_items"]
    bottle_item = next(item for item in order_items if item["product_id"] == bottle["id"])
    assert bottle_item["quantity"] == 3
    assert bottle_item["included_quantity"] == 3


@pytest.mark.anyio
async def test_registration_merges_explicit_extra_with_included_bundle_quantity(client):
    event = await _create_event(client)
    bottle = await _create_product(client, event["id"], name="Champagne Bottle", price="65.00")
    table = await _create_product(
        client,
        event["id"],
        name="VIP Table",
        price="200.00",
        required=True,
        included_product_id=bottle["id"],
        included_per_guests=2,
    )

    r = await _register(
        client,
        event["id"],
        [
            {"product_id": table["id"], "quantity": 1},
            {"product_id": bottle["id"], "quantity": 2},
        ],
        guest_count=6,
    )
    assert r.status_code == 201, r.text
    order_items = r.json()["order_items"]
    bottle_item = next(item for item in order_items if item["product_id"] == bottle["id"])
    # 3 included (6 guests / 2) + 2 explicitly requested extra = 5 total, 3 free.
    assert bottle_item["quantity"] == 5
    assert bottle_item["included_quantity"] == 3


@pytest.mark.anyio
async def test_registration_bundle_below_ratio_includes_nothing(client):
    event = await _create_event(client)
    bottle = await _create_product(client, event["id"], name="Champagne Bottle", price="65.00")
    table = await _create_product(
        client,
        event["id"],
        name="VIP Table",
        price="200.00",
        required=True,
        included_product_id=bottle["id"],
        included_per_guests=10,
    )

    r = await _register(
        client,
        event["id"],
        [{"product_id": table["id"], "quantity": 1}],
        guest_count=1,
    )
    assert r.status_code == 201, r.text
    order_items = r.json()["order_items"]
    assert all(item["product_id"] != bottle["id"] for item in order_items)


@pytest.mark.anyio
async def test_deleting_product_does_not_alter_existing_registration_order_items(client):
    """order_items is a snapshot taken at order time, not a live reference — deleting
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
            "order_items": [{"product_id": product["id"], "quantity": 1}],
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
    order_items = r.json()["order_items"]
    assert order_items[0]["name"] == "Bottle"
    assert order_items[0]["price"] == 12.0


@pytest.mark.anyio
async def test_deleting_bundled_product_clears_bundle_on_referencing_product(client):
    """ON DELETE SET NULL clears included_product_id on any product that bundles
    the deleted one; included_per_guests must be cleared alongside it so the
    "both or neither" invariant still holds after the delete."""
    event = await _create_event(client)
    bottle = await _create_product(client, event["id"], name="Bottle")
    table = await _create_product(
        client,
        event["id"],
        name="VIP Table",
        included_product_id=bottle["id"],
        included_per_guests=2,
    )

    r = await client.delete(f"/api/products/{bottle['id']}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get(f"/api/products/{table['id']}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["included_product_id"] is None
    assert body["included_per_guests"] is None


@pytest.mark.anyio
async def test_product_bundle_rejects_reverse_chaining(client):
    """Only single-level bundles are supported: a product that is already
    bundled by another product cannot itself bundle a third product."""
    event = await _create_event(client)
    base = await _create_product(client, event["id"], name="Base")
    middle = await _create_product(
        client,
        event["id"],
        name="Middle",
        included_product_id=base["id"],
        included_per_guests=1,
    )
    other = await _create_product(client, event["id"], name="Other")

    r = await client.put(
        f"/api/products/{base['id']}",
        json={"included_product_id": other["id"], "included_per_guests": 1},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400

    # sanity: middle's bundle is unaffected by the rejected attempt
    r = await client.get(f"/api/products/{middle['id']}", headers=ADMIN_HEADERS)
    assert r.json()["included_product_id"] == base["id"]


@pytest.mark.anyio
async def test_registration_rejects_order_item_quantity_over_limit(client):
    event = await _create_event(client)
    product = await _create_product(client, event["id"])

    r = await client.post(
        "/api/registrations",
        json={
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "phone": "+32499000000",
            "event_id": event["id"],
            "guest_count": 1,
            "order_items": [{"product_id": product["id"], "quantity": 101}],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 422


@pytest.mark.anyio
async def test_registration_rejects_too_many_order_item_lines(client):
    event = await _create_event(client)
    product = await _create_product(client, event["id"])

    r = await client.post(
        "/api/registrations",
        json={
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "phone": "+32499000000",
            "event_id": event["id"],
            "guest_count": 1,
            "order_items": [{"product_id": product["id"], "quantity": 1} for _ in range(51)],
            "notes": "",
            "honeypot": "",
            "form_start_time": "",
        },
    )
    assert r.status_code == 422
