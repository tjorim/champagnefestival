"""Tests for the public waitlist endpoint and the admin queue."""

from __future__ import annotations

import pytest

from app.models import WaitlistEntry
from tests.helpers import ADMIN_HEADERS, _create_event

SUBMISSION_ID = "1c51e9a0-2481-4a79-9895-f314449dc412"


async def _create_sold_out_product(client, *, event_id: str, name: str = "Champagneontbijt ticket") -> str:
    r = await client.post(
        "/api/products",
        json={"event_id": event_id, "name": name, "price": "0", "category": "other", "unit": "person", "stock": 0},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.anyio
async def test_waitlist_submission(client, db_session):
    event = await _create_event(client)
    product_id = await _create_sold_out_product(client, event_id=event["id"])

    r = await client.post(
        "/api/waitlist",
        json={
            "submission_id": SUBMISSION_ID,
            "product_id": product_id,
            "name": "Nancy Cattrysse",
            "email": "nancy@example.com",
            "phone": "+32470000000",
            "guest_count": 2,
            "notes": "Graag samen met mijn man.",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True

    stored = await db_session.get(WaitlistEntry, SUBMISSION_ID)
    assert stored is not None
    assert stored.product_id == product_id
    assert stored.guest_count == 2
    assert stored.request_id is not None


@pytest.mark.anyio
async def test_waitlist_submission_rejects_unknown_product(client):
    r = await client.post(
        "/api/waitlist",
        json={
            "submission_id": SUBMISSION_ID,
            "product_id": "no-such-product",
            "name": "Nancy Cattrysse",
            "email": "nancy@example.com",
        },
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_waitlist_submission_replay_does_not_duplicate(client, db_session):
    event = await _create_event(client)
    product_id = await _create_sold_out_product(client, event_id=event["id"])
    body = {
        "submission_id": SUBMISSION_ID,
        "product_id": product_id,
        "name": "Nancy Cattrysse",
        "email": "nancy@example.com",
    }

    assert (await client.post("/api/waitlist", json=body)).status_code == 200
    assert (await client.post("/api/waitlist", json=body)).status_code == 200

    from sqlalchemy import func, select

    count = (await db_session.execute(select(func.count()).select_from(WaitlistEntry))).scalar_one()
    assert count == 1


@pytest.mark.anyio
async def test_waitlist_admin_list_filters_by_event_and_product(client):
    event_a = await _create_event(client, edition_id="edition-waitlist-a", title="Event A")
    event_b = await _create_event(client, edition_id="edition-waitlist-b", title="Event B")
    product_a = await _create_sold_out_product(client, event_id=event_a["id"], name="Product A")
    product_b = await _create_sold_out_product(client, event_id=event_b["id"], name="Product B")

    await client.post(
        "/api/waitlist",
        json={
            "submission_id": "11111111-1111-1111-1111-111111111111",
            "product_id": product_a,
            "name": "Guest A",
            "email": "a@example.com",
        },
    )
    await client.post(
        "/api/waitlist",
        json={
            "submission_id": "22222222-2222-2222-2222-222222222222",
            "product_id": product_b,
            "name": "Guest B",
            "email": "b@example.com",
        },
    )

    by_event = await client.get("/api/waitlist", params={"event_id": event_a["id"]}, headers=ADMIN_HEADERS)
    assert [e["name"] for e in by_event.json()] == ["Guest A"]

    by_product = await client.get("/api/waitlist", params={"product_id": product_b}, headers=ADMIN_HEADERS)
    assert [e["name"] for e in by_product.json()] == ["Guest B"]

    entry = by_event.json()[0]
    assert entry["event_id"] == event_a["id"]
    assert entry["product_name"] == "Product A"


@pytest.mark.anyio
async def test_waitlist_admin_mark_handled_and_delete(client):
    event = await _create_event(client)
    product_id = await _create_sold_out_product(client, event_id=event["id"])
    await client.post(
        "/api/waitlist",
        json={
            "submission_id": SUBMISSION_ID,
            "product_id": product_id,
            "name": "Nancy Cattrysse",
            "email": "nancy@example.com",
        },
    )

    handled = await client.put(f"/api/waitlist/{SUBMISSION_ID}/handled", headers=ADMIN_HEADERS)
    assert handled.status_code == 200, handled.text
    handled_at = handled.json()["handled_at"]
    assert handled_at is not None

    repeated = await client.put(f"/api/waitlist/{SUBMISSION_ID}/handled", headers=ADMIN_HEADERS)
    assert repeated.json()["handled_at"] == handled_at

    deleted = await client.delete(f"/api/waitlist/{SUBMISSION_ID}", headers=ADMIN_HEADERS)
    assert deleted.status_code == 204

    listed = await client.get("/api/waitlist", headers=ADMIN_HEADERS)
    assert listed.json() == []


@pytest.mark.anyio
async def test_waitlist_admin_endpoints_require_admin(unauth_client):
    assert (await unauth_client.get("/api/waitlist")).status_code == 401
    assert (await unauth_client.put("/api/waitlist/nonexistent/handled")).status_code == 401
    assert (await unauth_client.delete("/api/waitlist/nonexistent")).status_code == 401
