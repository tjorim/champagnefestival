"""Merging duplicate people — identity adoption and volunteer period transfer."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event, _registration_body

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
async def test_merge_adopts_marketing_opt_in_from_duplicate(client):
    """Merging away a duplicate must not silently discard their consent —
    docs/decisions/934-data-retention-and-erasure.md."""
    event = await _create_event(client)
    r = await client.post(
        "/api/registrations",
        json=_registration_body(
            event, name="Opted In", email="optedin@example.com", phone="+32470000777", marketing_opt_in=True
        ),
    )
    assert r.status_code == 201, r.text
    duplicate_id = r.json()["person_id"]

    r = await client.post("/api/people", json=PLAIN, headers=ADMIN_HEADERS)
    canonical_id = r.json()["id"]
    assert r.json()["marketing_opt_in"] is False

    r = await _merge(client, canonical_id, duplicate_id)
    assert r.status_code == 200, r.text
    assert r.json()["marketing_opt_in"] is True
    assert r.json()["marketing_opt_in_at"] is not None


@pytest.mark.anyio
async def test_merge_keeps_canonical_opt_in_and_timestamp_when_both_have_one(client):
    event = await _create_event(client)
    r = await client.post(
        "/api/registrations",
        json=_registration_body(
            event, name="Opted In Dup", email="dup@example.com", phone="+32470000888", marketing_opt_in=True
        ),
    )
    assert r.status_code == 201, r.text
    duplicate_id = r.json()["person_id"]

    # Opt the canonical person in via the legitimate channel too, so both
    # sides of the merge already have their own consent and timestamp.
    r = await client.post(
        "/api/registrations",
        json=_registration_body(
            event, name="Sofie De Smet", email="sofie@example.com", phone="+32470000999", marketing_opt_in=True
        ),
    )
    assert r.status_code == 201, r.text
    canonical_id = r.json()["person_id"]
    r = await client.get(f"/api/people/{canonical_id}", headers=ADMIN_HEADERS)
    canonical_opted_in_at = r.json()["marketing_opt_in_at"]
    assert canonical_opted_in_at is not None

    r = await _merge(client, canonical_id, duplicate_id)
    assert r.status_code == 200, r.text
    assert r.json()["marketing_opt_in"] is True
    assert r.json()["marketing_opt_in_at"] == canonical_opted_in_at


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
