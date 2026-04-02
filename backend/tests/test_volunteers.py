"""Tests for the volunteers admin API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS


@pytest.mark.anyio
async def test_volunteers_require_auth(unauth_client):
    r = await unauth_client.get("/api/volunteers")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_volunteer_crud_and_constraints(client):
    payload = {
        "name": "Sofie De Smet",
        "address": "Dorpsstraat 12, 8450 Bredene",
        "national_register_number": "91010112345",
        "eid_document_number": "BEX123456",
        "active": True,
        "help_periods": [
            {
                "first_help_day": "2024-03-15",
                "last_help_day": "2024-03-17",
            },
            {
                "first_help_day": "2025-10-10",
                "last_help_day": None,
            },
        ],
    }

    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    volunteer = r.json()
    assert volunteer["name"] == "Sofie De Smet"
    assert len(volunteer["help_periods"]) == 2

    # duplicate insurance identity fields are rejected
    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 409

    volunteer_id = volunteer["id"]

    r = await client.get("/api/volunteers", params={"q": "bredene"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1

    # active filter support
    r = await client.get("/api/volunteers", params={"active": "true"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.put(
        f"/api/people/{volunteer_id}",
        json={"active": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get("/api/volunteers", params={"active": "false"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1
    r = await client.put(
        f"/api/volunteers/{volunteer_id}",
        json={
            "address": "Nieuwe Steenweg 8, 8400 Oostende",
            "active": True,
            "help_periods": [
                {
                    "first_help_day": "2024-03-15",
                    "last_help_day": "2024-03-17",
                },
                {
                    "first_help_day": "2025-03-21",
                    "last_help_day": "2025-03-23",
                },
                {
                    "first_help_day": "2025-10-10",
                    "last_help_day": None,
                },
            ],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["address"] == "Nieuwe Steenweg 8, 8400 Oostende"
    assert r.json()["active"] is True
    assert len(r.json()["help_periods"]) == 3

    r = await client.put(
        f"/api/volunteers/{volunteer_id}",
        json={
            "help_periods": [
                {
                    "first_help_day": "2025-10-11",
                    "last_help_day": "2025-10-10",
                }
            ]
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422

    r = await client.delete(f"/api/volunteers/{volunteer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    # Volunteer role is removed — endpoint returns 404.
    r = await client.get(f"/api/volunteers/{volunteer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 404

    # But the underlying person record still exists (soft archive).
    r = await client.get(f"/api/people/{volunteer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert "volunteer" not in r.json()["roles"]


@pytest.mark.anyio
async def test_volunteers_support_limit_and_page(client):
    created_ids: set[str] = set()
    for i, name in enumerate(("Vol Alpha", "Vol Bravo", "Vol Charlie")):
        r = await client.post(
            "/api/volunteers",
            json={
                "name": name,
                "national_register_number": f"9101011234{i}",
                "eid_document_number": f"BEPAG00{i}",
                "active": True,
                "help_periods": [{"first_help_day": "2024-03-15", "last_help_day": None}],
            },
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 201
        created_ids.add(r.json()["id"])

    first_page = await client.get("/api/volunteers", params={"limit": 2, "page": 1}, headers=ADMIN_HEADERS)
    assert first_page.status_code == 200
    first_page_results = first_page.json()
    assert len(first_page_results) == 2

    second_page = await client.get("/api/volunteers", params={"limit": 2, "page": 2}, headers=ADMIN_HEADERS)
    assert second_page.status_code == 200
    second_page_results = second_page.json()
    assert len(second_page_results) >= 1

    first_page_ids = {row["id"] for row in first_page_results}
    second_page_ids = {row["id"] for row in second_page_results}
    assert first_page_ids.isdisjoint(second_page_ids)

    # Ordering must be consistent with the unpaginated endpoint
    all_response = await client.get("/api/volunteers", headers=ADMIN_HEADERS)
    assert all_response.status_code == 200
    all_results = [r for r in all_response.json() if r["id"] in created_ids]
    assert all_results[:2] == first_page_results
    assert all_results[2:3] == second_page_results
