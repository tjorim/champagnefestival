"""Editions co-organized with an exhibitor (typically a champagne producer)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD


async def _venue_and_producer(client) -> tuple[str, int]:
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors", json={"name": "Champagne Comtesse", "type": "producer"}, headers=ADMIN_HEADERS
    )
    return venue_id, r.json()["id"]


@pytest.mark.anyio
async def test_bourse_can_be_co_organized_by_a_producer(client):
    """A bourse carries no lineup, but may still name who ran it with the vzw."""
    venue_id, producer_id = await _venue_and_producer(client)

    r = await client.post(
        "/api/editions",
        json={
            "id": "bourse-2026",
            "year": 2026,
            "month": "november",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "co_organizer_exhibitor_id": producer_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["co_organizer"]["id"] == producer_id
    assert body["co_organizer"]["name"] == "Champagne Comtesse"
    # Co-organizing is not lineup: the exhibitors list stays empty.
    assert body["producers"] == []
    assert body["sponsors"] == []


@pytest.mark.anyio
async def test_co_organizer_can_be_set_and_cleared(client):
    venue_id, producer_id = await _venue_and_producer(client)
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
    assert r.json()["co_organizer"] is None

    r = await client.put(
        "/api/editions/bourse-2026",
        json={"co_organizer_exhibitor_id": producer_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json()["co_organizer"]["id"] == producer_id

    r = await client.put("/api/editions/bourse-2026", json={"co_organizer_exhibitor_id": None}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["co_organizer"] is None


@pytest.mark.anyio
async def test_unknown_co_organizer_is_rejected(client):
    venue_id, _ = await _venue_and_producer(client)
    r = await client.post(
        "/api/editions",
        json={
            "id": "bourse-2026",
            "year": 2026,
            "month": "november",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "co_organizer_exhibitor_id": 999999,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400, r.text
    assert "co-organizer" in r.json()["detail"]


@pytest.mark.anyio
async def test_deleting_the_co_organizer_leaves_the_edition_intact(client):
    """The FK is SET NULL — losing the exhibitor must not take the edition with it."""
    venue_id, producer_id = await _venue_and_producer(client)
    await client.post(
        "/api/editions",
        json={
            "id": "bourse-2026",
            "year": 2026,
            "month": "november",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "co_organizer_exhibitor_id": producer_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )

    r = await client.delete(f"/api/exhibitors/{producer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204, r.text

    r = await client.get("/api/editions/bourse-2026", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["co_organizer"] is None
