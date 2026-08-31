"""Tests for volunteer operational endpoints."""

from __future__ import annotations

import pytest

from app.schemas import RegistrationDeliveryUpdate
from app.services.registrations_service import apply_delivery_updates
from tests.helpers import (
    ADMIN_HEADERS,
    ROOM_PAYLOAD,
    TABLE_TYPE_PAYLOAD,
    VENUE_PAYLOAD,
    _create_event,
    _post_registration,
)


def test_delivery_update_allows_bundled_order_quantity_above_request_limit():
    updated = apply_delivery_updates(
        [{"product_id": "bundled", "quantity": 120, "delivered_quantity": 0, "delivered": False}],
        [RegistrationDeliveryUpdate(product_id="bundled", delivered_quantity=110)],
    )

    assert updated[0]["delivered_quantity"] == 110
    assert updated[0]["delivered"] is False


async def _create_table(client, *, name: str) -> str:
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post("/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS)
    layout_id = r.json()["id"]
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    table_type_id = r.json()["id"]
    r = await client.post(
        "/api/tables",
        json={"name": name, "table_type_id": table_type_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    return r.json()["id"]


async def _post_registration_with_order(client, *, quantity: int = 2):
    event = await _create_event(client)
    product = await client.post(
        "/api/products",
        json={
            "event_id": event["id"],
            "name": "Champagne bottle",
            "price": "42.00",
            "category": "champagne",
        },
        headers=ADMIN_HEADERS,
    )
    assert product.status_code == 201
    response = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        order_items=[{"product_id": product.json()["id"], "quantity": quantity}],
    )
    return response


@pytest.mark.anyio
async def test_volunteer_registrations_support_table_lookup_and_hide_pii(client):
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

    r = await client.get("/api/volunteer/registrations", params={"q": "Table A"})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == registration_id
    assert row["table_id"] == table_id
    assert row["table_name"] == "Table A"
    assert row["notes"] == "No sugar"
    assert "order_items" in row
    assert "address" not in row
    assert "national_register_number" not in row
    assert "eid_document_number" not in row
    assert "email" not in row
    assert "phone" not in row


@pytest.mark.anyio
async def test_volunteer_registrations_support_accent_insensitive_and_typo_name_lookup(client):
    registration = await _post_registration(
        client,
        path="/api/registrations",
        name="François Dupont",
        email="francois@example.com",
    )
    assert registration.status_code == 201

    r = await client.get("/api/volunteer/registrations", params={"q": "Francois"})
    assert r.status_code == 200
    assert [row["id"] for row in r.json()] == [registration.json()["id"]]

    r = await client.get("/api/volunteer/registrations", params={"q": "Francoiss"})
    assert r.status_code == 200
    assert [row["id"] for row in r.json()] == [registration.json()["id"]]

    r = await client.get("/api/volunteer/registrations", params={"q": "francois@exmaple.com"})
    assert r.status_code == 200
    assert [row["id"] for row in r.json()] == [registration.json()["id"]]
    assert "email" not in r.json()[0]


@pytest.mark.anyio
async def test_volunteer_registrations_normalize_visible_table_reference_and_filter_pending_orders(client):
    registration = await _post_registration_with_order(client, quantity=1)
    assert registration.status_code == 201
    registration_id = registration.json()["id"]
    table_id = await _create_table(client, name="table-12")
    r = await client.put(
        f"/api/registrations/{registration_id}",
        json={"table_id": table_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get(
        "/api/volunteer/registrations",
        params={"q": "Table 12", "order_category": "champagne", "delivery_state": "pending"},
    )
    assert r.status_code == 200
    assert [row["id"] for row in r.json()] == [registration_id]

    r = await client.get("/api/volunteer/registrations", params={"q": "21"})
    assert r.status_code == 200
    # Table-number non-confusion ("21" must not match table-12) is covered by
    # rank_table_reference unit tests; this endpoint also searches registration
    # IDs, so a generated ID coincidentally containing "21" can appear here.

    r = await client.get("/api/volunteer/table-orders", params={"table_reference": "Table 12"})
    assert r.status_code == 200
    payload = r.json()
    assert payload["table_id"] == table_id
    assert [row["id"] for row in payload["registrations"]] == [registration_id]


@pytest.mark.anyio
async def test_volunteer_can_check_in_from_registration_search(client):
    registration = await _post_registration(client, path="/api/registrations")
    assert registration.status_code == 201
    registration_id = registration.json()["id"]

    r = await client.post(
        f"/api/volunteer/registrations/{registration_id}/check-in",
        json={"issue_strap": True},
    )
    assert r.status_code == 200
    payload = r.json()
    assert payload["already_checked_in"] is False
    assert payload["registration"]["id"] == registration_id
    assert payload["registration"]["checked_in"] is True
    assert payload["registration"]["strap_issued"] is True
    assert "email" not in payload["registration"]
    assert "phone" not in payload["registration"]

    r = await client.post(
        f"/api/volunteer/registrations/{registration_id}/check-in",
        json={"issue_strap": True},
    )
    assert r.status_code == 200
    assert r.json()["already_checked_in"] is True


@pytest.mark.anyio
async def test_volunteer_cannot_check_in_canceled_registration(client):
    registration = await _post_registration(client, path="/api/registrations")
    registration_id = registration.json()["id"]
    cancelled = await client.put(
        f"/api/registrations/{registration_id}",
        json={"status": "cancelled"},
        headers=ADMIN_HEADERS,
    )
    assert cancelled.status_code == 200

    response = await client.post(
        f"/api/volunteer/registrations/{registration_id}/check-in",
        json={"issue_strap": True},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Cancelled registrations cannot be checked in."


@pytest.mark.anyio
async def test_volunteer_can_issue_strap_and_update_delivery_from_check_in_card(client):
    registration = await _post_registration_with_order(client)
    assert registration.status_code == 201
    registration_id = registration.json()["id"]

    r = await client.put(
        f"/api/volunteer/registrations/{registration_id}",
        json={
            "strap_issued": True,
            "order_items": [
                {
                    "product_id": registration.json()["order_items"][0]["product_id"],
                    "delivered_quantity": 1,
                }
            ],
        },
    )

    assert r.status_code == 200
    payload = r.json()
    assert payload["id"] == registration_id
    assert payload["strap_issued"] is True
    assert payload["order_items"][0]["delivered_quantity"] == 1
    assert "email" not in payload
    assert "phone" not in payload


@pytest.mark.anyio
async def test_volunteer_delivery_update_cannot_change_order_details(client):
    registration = await _post_registration_with_order(client)
    registration_id = registration.json()["id"]
    original = registration.json()["order_items"][0]

    response = await client.put(
        f"/api/volunteer/registrations/{registration_id}",
        json={
            "order_items": [
                {
                    "product_id": original["product_id"],
                    "delivered_quantity": 1,
                    "name": "Forged",
                    "quantity": 99,
                    "price": 0,
                    "category": "other",
                }
            ]
        },
    )

    assert response.status_code == 422

    response = await client.put(
        f"/api/volunteer/registrations/{registration_id}",
        json={
            "order_items": [
                {"product_id": original["product_id"], "delivered_quantity": 1}
            ]
        },
    )
    assert response.status_code == 200
    updated = response.json()["order_items"][0]
    assert updated["delivered_quantity"] == 1
    for field in ("name", "quantity", "price", "category"):
        assert updated[field] == original[field]


@pytest.mark.anyio
async def test_volunteer_delivery_update_rejects_product_not_on_registration(client):
    registration = await _post_registration(client, path="/api/registrations")
    response = await client.put(
        f"/api/volunteer/registrations/{registration.json()['id']}",
        json={"order_items": [{"product_id": "not-ordered", "delivered_quantity": 1}]},
    )

    assert response.status_code == 400
    assert "not on this registration" in response.json()["detail"]


@pytest.mark.anyio
async def test_volunteer_delivery_update_rejects_quantity_above_ordered(client):
    registration = await _post_registration_with_order(client, quantity=2)
    item = registration.json()["order_items"][0]

    response = await client.put(
        f"/api/volunteer/registrations/{registration.json()['id']}",
        json={"order_items": [{"product_id": item["product_id"], "delivered_quantity": 3}]},
    )

    assert response.status_code == 400
    assert "cannot exceed quantity" in response.json()["detail"]


@pytest.mark.anyio
async def test_volunteer_update_registration_returns_404_for_unknown_id(client):
    r = await client.put(
        "/api/volunteer/registrations/nonexistent-id",
        json={"strap_issued": True},
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_volunteer_check_in_returns_404_for_unknown_id(client):
    r = await client.post(
        "/api/volunteer/registrations/nonexistent-id/check-in",
        json={"issue_strap": False},
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_volunteer_table_order_lookup_returns_candidates_for_ambiguous_reference(client):
    await _create_table(client, name="Table 12")
    await _create_table(client, name="Table 12 terrace")

    r = await client.get("/api/volunteer/table-orders", params={"table_reference": "12"})
    assert r.status_code == 200
    payload = r.json()
    assert payload["registrations"] == []
    assert len(payload["candidates"]) == 2
    assert "Multiple tables matched" in payload["message"]


@pytest.mark.anyio
async def test_volunteer_table_resolution_requires_authentication(unauth_client):
    r = await unauth_client.get("/api/volunteer/tables/resolve", params={"reference": "12"})
    assert r.status_code in {401, 403}
