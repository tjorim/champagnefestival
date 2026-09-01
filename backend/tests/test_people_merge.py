"""Merging duplicate people — identity adoption and volunteer period transfer."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS

VOLUNTEER = {
    "name": "Sofie De Smet",
    "address": "Dorpsstraat 12",
    "national_register_number": "91010112345",
    "eid_document_number": "BEX123456",
    "active": True,
    "help_periods": [
        {"first_help_day": "2024-03-15", "last_help_day": "2024-03-17"},
        {"first_help_day": "2025-10-10", "last_help_day": None},
    ],
}

PLAIN = {"name": "Sofie De Smet", "email": "sofie@example.com", "roles": ["member"]}


async def _merge(client, canonical_id: str, duplicate_id: str):
    return await client.post(f"/api/people/{canonical_id}/merge/{duplicate_id}", headers=ADMIN_HEADERS)


@pytest.mark.anyio
async def test_merge_adopts_identity_fields_when_canonical_created_first(client):
    """The canonical's row sorts first here, which used to break the UNIQUE swap.

    Both identity columns are UNIQUE, so the duplicate has to release its value
    before the canonical takes it. SQLAlchemy batches same-mapper UPDATEs by
    primary key, so relying on a single flush failed whenever the canonical's id
    sorted first — surfacing as a confusing 409 from the IntegrityError handler.
    """
    r = await client.post("/api/people", json=PLAIN, headers=ADMIN_HEADERS)
    canonical_id = r.json()["id"]
    r = await client.post("/api/volunteers", json=VOLUNTEER, headers=ADMIN_HEADERS)
    duplicate_id = r.json()["id"]
    assert canonical_id < duplicate_id, "test assumes the canonical row sorts first"

    r = await _merge(client, canonical_id, duplicate_id)
    assert r.status_code == 200, r.text
    assert r.json()["national_register_number"] == "91010112345"
    assert r.json()["eid_document_number"] == "bex123456"


@pytest.mark.anyio
async def test_merge_adopts_identity_fields_when_duplicate_created_first(client):
    r = await client.post("/api/volunteers", json=VOLUNTEER, headers=ADMIN_HEADERS)
    duplicate_id = r.json()["id"]
    r = await client.post("/api/people", json=PLAIN, headers=ADMIN_HEADERS)
    canonical_id = r.json()["id"]

    r = await _merge(client, canonical_id, duplicate_id)
    assert r.status_code == 200, r.text
    assert r.json()["national_register_number"] == "91010112345"


@pytest.mark.anyio
async def test_merge_transfers_volunteer_help_periods(client):
    """VolunteerPeriod cascades on delete, so it must be re-pointed, not dropped."""
    r = await client.post("/api/volunteers", json=VOLUNTEER, headers=ADMIN_HEADERS)
    duplicate_id = r.json()["id"]
    r = await client.post("/api/people", json=PLAIN, headers=ADMIN_HEADERS)
    canonical_id = r.json()["id"]

    r = await _merge(client, canonical_id, duplicate_id)
    assert r.status_code == 200, r.text
    # Roles are unioned, so the survivor is a volunteer and must look like one.
    assert "volunteer" in r.json()["roles"]

    r = await client.get("/api/volunteers", headers=ADMIN_HEADERS)
    volunteers = {v["id"]: v for v in r.json()["items"]}
    assert canonical_id in volunteers
    assert len(volunteers[canonical_id]["help_periods"]) == 2
    assert duplicate_id not in volunteers


@pytest.mark.anyio
async def test_merge_still_rejects_conflicting_identity_fields(client):
    """Two different national register numbers remain a manual-resolution 409."""
    r = await client.post("/api/volunteers", json=VOLUNTEER, headers=ADMIN_HEADERS)
    duplicate_id = r.json()["id"]
    r = await client.post(
        "/api/people",
        json={**PLAIN, "national_register_number": "85020254321"},
        headers=ADMIN_HEADERS,
    )
    canonical_id = r.json()["id"]

    r = await _merge(client, canonical_id, duplicate_id)
    assert r.status_code == 409
    assert "national register number" in r.json()["detail"]
