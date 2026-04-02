"""Tests for the exhibitors API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS


@pytest.mark.anyio
async def test_exhibitors_require_admin(unauth_client):
    r = await unauth_client.get("/api/exhibitors")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_exhibitor_crud(client):
    # Create producer
    r = await client.post(
        "/api/exhibitors",
        json={
            "name": "Maison Bollinger",
            "image": "/img/bollinger.jpg",
            "website": "https://bollinger.com",
            "type": "producer",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    producer = r.json()
    assert producer["name"] == "Maison Bollinger"
    assert producer["type"] == "producer"
    assert producer["contact_person"] is None
    producer_id = producer["id"]

    # Create sponsor
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Acme Corp", "type": "sponsor"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    assert r.json()["type"] == "sponsor"

    # List all
    r = await client.get("/api/exhibitors", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 2

    # Filter by type
    r = await client.get("/api/exhibitors", params={"type": "producer"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "Maison Bollinger"

    # Update
    r = await client.put(
        f"/api/exhibitors/{producer_id}",
        json={"website": "https://bollinger.fr"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["website"] == "https://bollinger.fr"

    # Delete
    r = await client.delete(f"/api/exhibitors/{producer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/exhibitors", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_exhibitor_with_contact_person(client):
    """An exhibitor can reference a Person as contact; summary is embedded."""
    r = await client.post(
        "/api/people",
        json={"name": "Alice Contact", "email": "alice@example.com"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    person_id = r.json()["id"]

    r = await client.post(
        "/api/exhibitors",
        json={
            "name": "Fine Wines Ltd",
            "type": "vendor",
            "contact_person_id": person_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["contact_person"]["name"] == "Alice Contact"
    assert data["contact_person_id"] == person_id

    # Remove contact via update (set to null)
    exhibitor_id = data["id"]
    r = await client.put(
        f"/api/exhibitors/{exhibitor_id}",
        json={"contact_person_id": None},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["contact_person"] is None


@pytest.mark.anyio
async def test_exhibitor_invalid_contact_person(client):
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Bad Corp", "contact_person_id": "nonexistent-id"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_exhibitors_support_limit_and_page(client):
    created_ids: set[int] = set()
    for name in ("Alpha", "Bravo", "Charlie"):
        response = await client.post(
            "/api/exhibitors",
            json={"name": name, "type": "producer"},
            headers=ADMIN_HEADERS,
        )
        assert response.status_code == 201
        created_ids.add(response.json()["id"])

    first_page = await client.get("/api/exhibitors", params={"limit": 2, "page": 1}, headers=ADMIN_HEADERS)
    assert first_page.status_code == 200
    first_page_results = first_page.json()
    assert len(first_page_results) == 2

    second_page = await client.get("/api/exhibitors", params={"limit": 2, "page": 2}, headers=ADMIN_HEADERS)
    assert second_page.status_code == 200
    second_page_results = second_page.json()
    assert len(second_page_results) == 1

    first_page_ids = {row["id"] for row in first_page_results}
    second_page_ids = {row["id"] for row in second_page_results}
    assert first_page_ids.isdisjoint(second_page_ids)
    assert first_page_ids.union(second_page_ids) == created_ids

    # Ordering must be consistent with the unpaginated endpoint
    all_response = await client.get("/api/exhibitors", headers=ADMIN_HEADERS)
    assert all_response.status_code == 200
    all_results = [r for r in all_response.json() if r["id"] in created_ids]
    assert all_results[:2] == first_page_results
    assert all_results[2:3] == second_page_results
