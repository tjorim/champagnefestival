"""Recording what a booking owes, settled offline."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD


async def _registration(client) -> str:
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/editions",
        json={
            "id": "bourse-2026",
            "year": 2026,
            "month": "november",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        "/api/events",
        json={
            "edition_id": "bourse-2026",
            "title": "Bourse De la Comtesse",
            "description": "",
            "date": "2026-11-21",
            "start_time": "09:00",
            "end_time": "15:30",
            "category": "other",
            "registration_required": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    event_id = r.json()["id"]

    r = await client.post("/api/people", json={"name": "Collector"}, headers=ADMIN_HEADERS)
    person_id = r.json()["id"]
    r = await client.post(
        "/api/registrations/admin",
        json={"person_id": person_id, "event_id": event_id, "guest_count": 1},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.anyio
async def test_amount_due_defaults_to_nothing_owed(client):
    registration_id = await _registration(client)
    r = await client.get(f"/api/registrations/{registration_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["amount_due"] is None
    assert r.json()["payment_status"] == "unpaid"


@pytest.mark.anyio
async def test_admin_records_a_table_fee_and_marks_it_paid(client):
    registration_id = await _registration(client)

    r = await client.put(
        f"/api/registrations/{registration_id}",
        json={"amount_due": "25.00"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert float(r.json()["amount_due"]) == 25.00

    # Payment itself stays a manual, offline-settled flag.
    r = await client.put(
        f"/api/registrations/{registration_id}",
        json={"payment_status": "paid"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json()["payment_status"] == "paid"
    assert float(r.json()["amount_due"]) == 25.00


@pytest.mark.anyio
async def test_amount_due_can_be_cleared_and_rejects_negatives(client):
    registration_id = await _registration(client)
    await client.put(f"/api/registrations/{registration_id}", json={"amount_due": "25.00"}, headers=ADMIN_HEADERS)

    r = await client.put(f"/api/registrations/{registration_id}", json={"amount_due": None}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["amount_due"] is None

    r = await client.put(
        f"/api/registrations/{registration_id}",
        json={"amount_due": "-5.00"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422, r.text
