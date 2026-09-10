"""Inventory and package booking contracts, including explicit bulk updates."""

import pytest

from tests.helpers import VALID_RESERVATION, _create_event
from tests.test_products import _create_product


async def book(client, event, product, quantity=1, email="inventory@example.com"):
    return await client.post(
        "/api/registrations",
        json={
            **VALID_RESERVATION,
            "event_id": event["id"],
            "email": email,
            "order_items": [{"product_id": product["id"], "quantity": quantity}],
        },
    )


def edge(product, quantity=1, per_quantity=1, rounding="down"):
    return {"product_id": product["id"], "quantity": quantity, "per_quantity": per_quantity, "rounding": rounding}


@pytest.mark.anyio
async def test_nested_packages_reserve_included_stock_and_cancel_releases(client):
    event = await _create_event(client)
    coffee = await _create_product(client, event["id"], name="Coffee", price="3", stock=8)
    breakfast = await _create_product(client, event["id"], name="Breakfast", inclusions=[edge(coffee)])
    table = await _create_product(
        client, event["id"], name="VIP table", unit="table", price="100", stock=4, inclusions=[edge(breakfast, 4)]
    )
    response = await book(client, event, table, 2)
    assert response.status_code == 201, response.text
    registration = response.json()
    assert registration["amount_due"] == "200.00"
    items = {i["product_id"]: i for i in registration["order_items"]}
    assert items[coffee["id"]]["quantity"] == items[coffee["id"]]["included_quantity"] == 8
    stock = (await client.get(f"/api/products/{coffee['id']}")).json()
    assert stock["reserved_quantity"] == 8
    assert stock["available_quantity"] == 0
    assert (await book(client, event, table, email="second@example.com")).status_code == 409
    response = await client.put(f"/api/registrations/{registration['id']}", json={"status": "cancelled"})
    assert response.status_code == 200, response.text
    assert (await book(client, event, table, email="second@example.com")).status_code == 201


@pytest.mark.anyio
async def test_booked_prices_and_payment_survive_quantity_reduction(client):
    event = await _create_event(client)
    table = await _create_product(client, event["id"], price="50", stock=10)
    registration = (await book(client, event, table, 3)).json()
    response = await client.post(
        f"/api/registrations/{registration['id']}/transactions",
        json={"amount": "150.00", "effective_date": "2026-01-01"},
    )
    assert response.status_code == 201, response.text
    assert (await client.put(f"/api/products/{table['id']}", json={"price": "80"})).status_code == 200
    response = await client.put(
        f"/api/registrations/{registration['id']}", json={"order_items": [{"product_id": table["id"], "quantity": 1}]}
    )
    assert response.status_code == 200, response.text
    assert response.json()["amount_due"] == "50.00"
    assert response.json()["amount_paid"] == "150.00"
    assert response.json()["refund_due"] == "100.00"
    assert (await book(client, event, table, email="new@example.com")).json()["amount_due"] == "80.00"


@pytest.mark.anyio
async def test_stock_shortage_requires_preview_and_stale_preview_rejected(client):
    event = await _create_event(client)
    product = await _create_product(client, event["id"], stock=10)
    registration = (await book(client, event, product, 3)).json()
    url = f"/api/products/{product['id']}"
    body = {"stock": 1}
    assert (await client.put(url, json=body)).status_code == 409
    preview = (await client.post(url + "/preview", json=body)).json()
    assert preview["shortages"][0]["shortage"] == 2
    assert (await client.get(url)).json()["stock"] == 10  # preview is read-only
    await book(client, event, product, email="other@example.com")
    assert (
        await client.put(url, json={**body, "preview_token": preview["preview_token"], "confirm_shortage": True})
    ).status_code == 409
    preview = (await client.post(url + "/preview", json=body)).json()
    response = await client.put(url, json={**body, "preview_token": preview["preview_token"], "confirm_shortage": True})
    assert response.status_code == 200, response.text
    assert response.json()["shortage"] == 3
    assert (await book(client, event, product, email="third@example.com")).status_code == 409
    response = await client.put(
        f"/api/registrations/{registration['id']}", json={"order_items": [{"product_id": product["id"], "quantity": 2}]}
    )
    assert response.status_code == 200, response.text


@pytest.mark.anyio
async def test_package_update_and_price_choices_are_independent(client):
    event = await _create_event(client)
    coffee = await _create_product(client, event["id"], name="Coffee", price="3")
    package = await _create_product(client, event["id"], price="10", inclusions=[edge(coffee)])
    registration = (await book(client, event, package, 3)).json()
    body = {"price": "20", "inclusions": [edge(coffee, 1, 2, "up")], "update_existing_contents": True}
    url = f"/api/products/{package['id']}"
    preview = (await client.post(url + "/preview", json=body)).json()
    assert preview["bookings"][0]["after_total"] == "30.00"
    response = await client.put(url, json={**body, "preview_token": preview["preview_token"]})
    assert response.status_code == 200, response.text
    registration = (await client.get(f"/api/registrations/{registration['id']}")).json()
    assert registration["amount_due"] == "30.00"
    assert next(i for i in registration["order_items"] if i["product_id"] == coffee["id"])["quantity"] == 2
    assert (await client.put(f"/api/products/{coffee['id']}", json={"inclusions": [edge(package)]})).status_code == 400


@pytest.mark.anyio
async def test_legacy_accessibility_input_merges_into_notes(client):
    event = await _create_event(client)
    response = await client.post(
        "/api/registrations",
        json={
            **VALID_RESERVATION,
            "event_id": event["id"],
            "notes": "Near friends",
            "accessibility_note": "Step-free access",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["notes"] == "Near friends\n\nStep-free access"
    assert "accessibility_note" not in response.json()


@pytest.mark.anyio
async def test_concurrent_bookings_cannot_sell_last_stock_twice(client, engine):
    import asyncio

    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.schemas import RegistrationAdminCreate
    from app.services.registrations_service import admin_create_registration

    event = await _create_event(client)
    product = await _create_product(client, event["id"], stock=1)
    person = (
        await client.post(
            "/api/people", json={"name": "Inventory race", "email": "race@example.com", "phone": "+32499000000"}
        )
    ).json()
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def attempt():
        async with factory() as db:
            try:
                await admin_create_registration(
                    db,
                    body=RegistrationAdminCreate(
                        person_id=person["id"],
                        event_id=event["id"],
                        guest_count=1,
                        order_items=[{"product_id": product["id"], "quantity": 1}],
                    ),
                    actor="test",
                )
                return 201
            except HTTPException as exc:
                await db.rollback()
                return exc.status_code

    assert sorted(await asyncio.gather(attempt(), attempt())) == [201, 409]


def test_order_total_rejects_currency_overflow():
    from fastapi import HTTPException

    from app.services.product_inventory import order_total

    with pytest.raises(HTTPException) as exc:
        order_total([{"price": 99999999.99, "quantity": 2}])
    assert exc.value.status_code == 400


@pytest.mark.anyio
async def test_guest_count_edit_keeps_manual_total_without_products(client):
    event = await _create_event(client)
    registration = (await client.post("/api/registrations", json={**VALID_RESERVATION, "event_id": event["id"]})).json()
    url = f"/api/registrations/{registration['id']}"
    assert (await client.put(url, json={"amount_due": "25"})).status_code == 200
    response = await client.put(url, json={"guest_count": 3})
    assert response.status_code == 200, response.text
    assert response.json()["amount_due"] == "25.00"
