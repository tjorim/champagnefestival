"""Whether an event allows pre-orders is independent of its display category."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD


async def _edition(client) -> str:
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/editions",
        json={"id": "2026", "year": 2026, "month": "march", "venue_id": venue_id, "active": True},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return "2026"


@pytest.mark.anyio
async def test_allow_preorders_defaults_to_false(client):
    edition_id = await _edition(client)
    r = await client.post(
        "/api/events",
        json={
            "edition_id": edition_id,
            "title": "Grand tasting",
            "description": "",
            "date": "2026-03-06",
            "start_time": "18:00",
            "category": "vip",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    # Being categorised "vip" grants nothing by itself — that's a display label.
    assert r.json()["allow_preorders"] is False


@pytest.mark.anyio
async def test_allow_preorders_is_settable_independent_of_category(client):
    """A Sunday-morning capsule exchange during the festival, not a "vip" event."""
    edition_id = await _edition(client)
    r = await client.post(
        "/api/events",
        json={
            "edition_id": edition_id,
            "title": "Capsule exchange",
            "description": "",
            "date": "2026-03-08",
            "start_time": "10:00",
            "category": "exchange",
            "allow_preorders": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    assert r.json()["category"] == "exchange"
    assert r.json()["allow_preorders"] is True


@pytest.mark.anyio
async def test_allow_preorders_can_be_toggled_on_update(client):
    edition_id = await _edition(client)
    r = await client.post(
        "/api/events",
        json={
            "edition_id": edition_id,
            "title": "Tasting",
            "description": "",
            "date": "2026-03-06",
            "start_time": "12:00",
            "category": "tasting",
        },
        headers=ADMIN_HEADERS,
    )
    event_id = r.json()["id"]
    assert r.json()["allow_preorders"] is False

    r = await client.put(f"/api/events/{event_id}", json={"allow_preorders": True}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["allow_preorders"] is True
    # Category is untouched by the toggle — the two are independent.
    assert r.json()["category"] == "tasting"

    r = await client.put(f"/api/events/{event_id}", json={"allow_preorders": False}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["allow_preorders"] is False
