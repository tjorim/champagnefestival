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
        "help_periods": [
            {
                "first_help_day": "2024-03-15",
                "last_help_day": "2024-03-17",
                "notes": "  Fri: bar, Sat: serving  ",
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
    # notes is stripped and defaults to "" when omitted — a rough,
    # unstructured schedule/notepad rather than a role/task model.
    assert volunteer["help_periods"][0]["notes"] == "Fri: bar, Sat: serving"
    assert volunteer["help_periods"][1]["notes"] == ""

    # duplicate insurance identity fields are rejected
    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 409

    volunteer_id = volunteer["id"]

    r = await client.get("/api/volunteers", params={"q": "bredene"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1

    # active filter support
    r = await client.get("/api/volunteers", params={"active": "true"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1

    r = await client.post(f"/api/volunteers/{volunteer_id}/deactivate", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/volunteers", params={"active": "false"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1
    r = await client.post(f"/api/volunteers/{volunteer_id}/reactivate", headers=ADMIN_HEADERS)
    assert r.status_code == 204
    r = await client.put(
        f"/api/volunteers/{volunteer_id}",
        json={
            "address": "Nieuwe Steenweg 8, 8400 Oostende",
            "help_periods": [
                {
                    "first_help_day": "2024-03-15",
                    "last_help_day": "2024-03-17",
                },
                {
                    "first_help_day": "2025-03-21",
                    "last_help_day": "2025-03-23",
                    "notes": "Sun: desk",
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
    assert r.json()["anonymised"] is False
    assert len(r.json()["help_periods"]) == 3
    assert r.json()["help_periods"][1]["notes"] == "Sun: desk"

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

    # The volunteer is active and listed.
    r = await client.get("/api/volunteers", params={"active": "true"}, headers=ADMIN_HEADERS)
    assert [item["id"] for item in r.json()["items"]] == [volunteer_id]

    r = await client.post(f"/api/volunteers/{volunteer_id}/deactivate", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    # Stepping back keeps the role, the person and all three help periods ...
    r = await client.get(f"/api/volunteers/{volunteer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    periods = r.json()["help_periods"]
    assert len(periods) == 3
    # ... the open one is now closed, and the volunteer role is retired rather than removed.
    assert all(period["last_help_day"] is not None for period in periods)
    person = await client.get(f"/api/people/{volunteer_id}", headers=ADMIN_HEADERS)
    assert "volunteer" in person.json()["roles"]
    assert list(person.json()["retired_roles"]) == ["volunteer"]
    assert person.json()["anonymised"] is False
    r = await client.get("/api/volunteers", params={"active": "true"}, headers=ADMIN_HEADERS)
    assert r.json()["items"] == []
    r = await client.get("/api/volunteers", params={"active": "false"}, headers=ADMIN_HEADERS)
    assert [item["id"] for item in r.json()["items"]] == [volunteer_id]

    # Ending again is a no-op, not an error.
    r = await client.post(f"/api/volunteers/{volunteer_id}/deactivate", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    # Reactivating brings them back (periods are not reopened); a repeat is a no-op too.
    r = await client.post(f"/api/volunteers/{volunteer_id}/reactivate", headers=ADMIN_HEADERS)
    assert r.status_code == 204
    r = await client.get("/api/volunteers", params={"active": "true"}, headers=ADMIN_HEADERS)
    assert [item["id"] for item in r.json()["items"]] == [volunteer_id]
    r = await client.post(f"/api/volunteers/{volunteer_id}/reactivate", headers=ADMIN_HEADERS)
    assert r.status_code == 204


@pytest.mark.anyio
async def test_volunteer_duplicate_national_register_number_detected_despite_formatting(client):
    """'93.05.18-223.61' and '93051822361' are the same identity — volunteers_service
    normalises the same way people_service does (#866), so the second create is
    rejected as a 409 even though the raw strings differ."""
    payload = {
        "name": "First Volunteer",
        "national_register_number": "93.05.18-223.61",
        "eid_document_number": "BEX000001",
        "help_periods": [{"first_help_day": "2026-03-15", "last_help_day": "2026-03-17"}],
    }
    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201

    payload = {
        "name": "Second Volunteer",
        "national_register_number": "93051822361",
        "eid_document_number": "BEX000002",
        "help_periods": [{"first_help_day": "2026-03-15", "last_help_day": "2026-03-17"}],
    }
    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 409


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
                "help_periods": [{"first_help_day": "2024-03-15", "last_help_day": None}],
            },
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 201
        created_ids.add(r.json()["id"])

    first_page = await client.get("/api/volunteers", params={"limit": 2, "page": 1}, headers=ADMIN_HEADERS)
    assert first_page.status_code == 200
    first_page_body = first_page.json()
    first_page_results = first_page_body["items"]
    assert len(first_page_results) == 2
    assert first_page_body["limit"] == 2
    assert first_page_body["page"] == 1
    assert first_page_body["total"] >= len(created_ids)

    second_page = await client.get("/api/volunteers", params={"limit": 2, "page": 2}, headers=ADMIN_HEADERS)
    assert second_page.status_code == 200
    second_page_results = second_page.json()["items"]
    assert len(second_page_results) >= 1

    first_page_ids = {row["id"] for row in first_page_results}
    second_page_ids = {row["id"] for row in second_page_results}
    assert first_page_ids.isdisjoint(second_page_ids)

    # Ordering must be consistent with the unpaginated endpoint
    all_response = await client.get("/api/volunteers", params={"limit": 1000}, headers=ADMIN_HEADERS)
    assert all_response.status_code == 200
    all_results = [r for r in all_response.json()["items"] if r["id"] in created_ids]
    assert all_results[:2] == first_page_results
    assert all_results[2:3] == second_page_results


@pytest.mark.anyio
@pytest.mark.parametrize(
    "details",
    [
        {},
        {"national_register_number": None, "eid_document_number": None, "help_periods": []},
        {"national_register_number": "  ", "eid_document_number": ""},
    ],
)
async def test_volunteer_creation_matches_people_with_volunteer_role(client, details):
    response = await client.post("/api/volunteers", json={"name": "  Name only  ", **details}, headers=ADMIN_HEADERS)
    assert response.status_code == 201
    volunteer = response.json()
    assert volunteer["name"] == "Name only"
    assert volunteer["national_register_number"] is None
    assert volunteer["eid_document_number"] is None
    assert volunteer["help_periods"] == []
    person = await client.get(f"/api/people/{volunteer['id']}", headers=ADMIN_HEADERS)
    assert person.status_code == 200
    assert "volunteer" in person.json()["roles"]
    assert "volunteer" in person.json()["role_history"]
    listing = await client.get("/api/volunteers", params={"active": True}, headers=ADMIN_HEADERS)
    assert volunteer["id"] in {row["id"] for row in listing.json()["items"]}


@pytest.mark.anyio
async def test_volunteer_details_can_be_added_later_preserved_and_removed(client):
    created = await client.post("/api/volunteers", json={"name": "Start small"}, headers=ADMIN_HEADERS)
    assert created.status_code == 201
    path = f"/api/volunteers/{created.json()['id']}"
    details = {
        "national_register_number": "91.01.01-123.45",
        "eid_document_number": "BEX123456",
        "help_periods": [{"first_help_day": "2026-10-19", "last_help_day": None}],
    }
    added = await client.put(path, json=details, headers=ADMIN_HEADERS)
    assert added.status_code == 200
    assert added.json()["national_register_number"] == "91010112345"
    assert len(added.json()["help_periods"]) == 1
    preserved = await client.put(path, json={"name": "Renamed", "help_periods": None}, headers=ADMIN_HEADERS)
    assert preserved.status_code == 200
    assert preserved.json()["help_periods"] == added.json()["help_periods"]
    assert preserved.json()["eid_document_number"] == added.json()["eid_document_number"]
    cleared = await client.put(
        path,
        json={"national_register_number": "", "eid_document_number": None, "help_periods": []},
        headers=ADMIN_HEADERS,
    )
    assert cleared.status_code == 200
    assert cleared.json()["help_periods"] == []
    assert cleared.json()["national_register_number"] is None
    assert cleared.json()["eid_document_number"] is None
    assert cleared.json()["role_history"] == created.json()["role_history"]


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload",
    [
        {"name": "  "},
        {"name": "Incomplete", "help_periods": [{}]},
        {"name": "Null periods", "help_periods": None},
    ],
)
async def test_optional_volunteer_details_do_not_allow_invalid_entries(client, payload):
    response = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert response.status_code == 422
