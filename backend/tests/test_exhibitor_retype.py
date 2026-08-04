"""Retyping an exhibitor to vendor while editions still link to it."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD


async def _linked_producer(client) -> int:
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors", json={"name": "Bollinger", "type": "producer"}, headers=ADMIN_HEADERS
    )
    producer_id = r.json()["id"]
    r = await client.post(
        "/api/editions",
        json={
            "id": "2026",
            "year": 2026,
            "month": "march",
            "venue_id": venue_id,
            "exhibitors": [producer_id],
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return producer_id


@pytest.mark.anyio
async def test_retype_to_vendor_is_rejected_while_editions_link_to_it(client):
    """Editions reject vendor ids, so this retype would strand them unsaveable."""
    producer_id = await _linked_producer(client)

    r = await client.put(f"/api/exhibitors/{producer_id}", json={"type": "vendor"}, headers=ADMIN_HEADERS)
    assert r.status_code == 409, r.text
    assert "2026" in r.json()["detail"]

    # The edition is still saveable because the retype never landed.
    r = await client.get("/api/editions/2026", headers=ADMIN_HEADERS)
    assert r.json()["vendors"] == []
    assert len(r.json()["producers"]) == 1


@pytest.mark.anyio
async def test_retype_to_vendor_allowed_once_unlinked(client):
    producer_id = await _linked_producer(client)

    r = await client.put(
        "/api/editions/2026",
        json={"exhibitors": []},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text

    r = await client.put(f"/api/exhibitors/{producer_id}", json={"type": "vendor"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["type"] == "vendor"


@pytest.mark.anyio
async def test_other_retypes_are_unaffected(client):
    """Only vendor is restricted — producer/sponsor stay interchangeable."""
    producer_id = await _linked_producer(client)

    r = await client.put(f"/api/exhibitors/{producer_id}", json={"type": "sponsor"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text

    r = await client.get("/api/editions/2026", headers=ADMIN_HEADERS)
    assert len(r.json()["sponsors"]) == 1
