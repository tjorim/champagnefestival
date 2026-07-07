"""Tests for the audit log read endpoint."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD


@pytest.mark.anyio
async def test_audit_requires_auth(unauth_client):
    r = await unauth_client.get("/api/audit")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_audit_lists_entries_from_mutations(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    venue_id = r.json()["id"]

    r = await client.get(
        "/api/audit", params={"resource_type": "venue", "resource_id": venue_id}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    entries = r.json()
    assert len(entries) == 1
    assert entries[0]["action"] == "venue_created"
    assert entries[0]["resource_type"] == "venue"
    assert entries[0]["resource_id"] == venue_id
    assert entries[0]["details"] == {"name": "Test Venue"}


@pytest.mark.anyio
async def test_audit_filters_by_action(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    await client.put(f"/api/venues/{venue_id}", json={"city": "Bredene"}, headers=ADMIN_HEADERS)

    r = await client.get(
        "/api/audit", params={"resource_id": venue_id, "action": "venue_updated"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    entries = r.json()
    assert len(entries) == 1
    assert entries[0]["action"] == "venue_updated"


@pytest.mark.anyio
async def test_audit_supports_pagination(client):
    for i in range(3):
        r = await client.post("/api/venues", json={"name": f"Paged Venue {i}"}, headers=ADMIN_HEADERS)
        assert r.status_code == 201

    r = await client.get("/api/audit", params={"resource_type": "venue", "limit": 2}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.anyio
async def test_audit_filters_by_timezone_naive_since_and_until(client):
    """A `since`/`until` query value without a UTC offset must not crash the comparison
    against the timezone-aware `timestamp` column."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    venue_id = r.json()["id"]

    r = await client.get(
        "/api/audit",
        params={"resource_id": venue_id, "since": "2000-01-01T00:00:00", "until": "2100-01-01T00:00:00"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_audit_resource_types_lists_distinct_values(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201

    r = await client.get("/api/audit/resource-types", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert "venue" in r.json()
