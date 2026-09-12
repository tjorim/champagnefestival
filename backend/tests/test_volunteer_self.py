"""Integration tests for /api/me/volunteer/* self-service identity endpoints (#1006).

Fixture NISS/eID values below are checksum-valid (mod 97 — see
app.services.identity_checksum) so they pass self-registration's validation;
they are not real people's numbers.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditEntry, Person
from tests.helpers import ADMIN_HEADERS

NISS_A = "91010112319"
EID_A = "123456789002"
NISS_B = "91010112418"
EID_B = "123456789103"
NISS_POST_2000 = "05010112385"
EID_C = "123456789204"

VOLUNTEER_PAYLOAD = {
    "name": "Sofie De Smet",
    "address": "Dorpsstraat 12, 8450 Bredene",
    "national_register_number": NISS_A,
    "eid_document_number": EID_A,
    "active": True,
    "help_periods": [{"first_help_day": "2024-03-15", "last_help_day": "2024-03-17"}],
}


async def _create_volunteer(client, **overrides) -> dict:
    """Admin-side pre-creation — still supported for bulk/historical data."""
    payload = {**VOLUNTEER_PAYLOAD, **overrides}
    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    return r.json()


async def _register(vclient, *, name="Sofie De Smet", niss=NISS_A, eid=EID_A):
    return await vclient.post(
        "/api/me/volunteer/register",
        json={"name": name, "national_register_number": niss, "eid_document_number": eid},
    )


@pytest.mark.anyio
async def test_get_identity_when_not_linked(volunteer_client_as):
    async with volunteer_client_as() as vclient:
        r = await vclient.get("/api/me/volunteer")
        assert r.status_code == 200
        assert r.json() == {
            "linked": False,
            "name": None,
            "national_register_number": None,
            "eid_document_number": None,
        }


@pytest.mark.anyio
async def test_register_creates_a_new_volunteer_record(volunteer_client_as, db_session):
    async with volunteer_client_as("subject-a") as vclient:
        r = await _register(vclient)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["linked"] is True
        assert body["name"] == "Sofie De Smet"
        assert body["national_register_number"] == NISS_A
        assert body["eid_document_number"] == EID_A

        get_r = await vclient.get("/api/me/volunteer")
        assert get_r.status_code == 200
        assert get_r.json()["linked"] is True

    person = (await db_session.scalars(select(Person).where(Person.oidc_subject == "subject-a"))).one()
    assert "volunteer" in person.roles
    assert person.national_register_number == NISS_A

    audits = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "volunteer_identity_registered",
                AuditEntry.resource_id == person.id,
            )
        )
    ).all()
    assert len(audits) == 1
    assert audits[0].details["linked_existing_record"] is False


@pytest.mark.anyio
async def test_register_accepts_a_post_2000_niss(volunteer_client_as):
    async with volunteer_client_as("subject-a") as vclient:
        r = await _register(vclient, niss=NISS_POST_2000, eid=EID_C)
        assert r.status_code == 200, r.text


@pytest.mark.anyio
async def test_register_is_idempotent_for_an_already_linked_subject(volunteer_client_as):
    async with volunteer_client_as("subject-a") as vclient:
        first = await _register(vclient)
        assert first.status_code == 200

        # Resubmitting — even with different (also-valid) details — just
        # returns the existing record; it never overwrites or errors.
        second = await _register(vclient, name="Someone Else", niss=NISS_B, eid=EID_B)
        assert second.status_code == 200
        assert second.json() == first.json()


@pytest.mark.anyio
async def test_register_rejects_invalid_niss_checksum(volunteer_client_as):
    async with volunteer_client_as("subject-a") as vclient:
        r = await _register(vclient, niss="00000000000")
        assert r.status_code == 422


@pytest.mark.anyio
async def test_register_rejects_invalid_eid_checksum(volunteer_client_as):
    async with volunteer_client_as("subject-a") as vclient:
        r = await _register(vclient, eid="999999999999")
        assert r.status_code == 422


@pytest.mark.anyio
async def test_register_links_an_existing_unlinked_admin_created_record(client, volunteer_client_as, db_session):
    """A pre-existing admin-imported record with matching NISS+eID is adopted
    rather than duplicated, preserving its help-period history."""
    volunteer = await _create_volunteer(client)

    async with volunteer_client_as("subject-a") as vclient:
        r = await _register(vclient, name="Different Name Typed In", niss="91.01.01-123.19", eid="123-4567890-02")
        assert r.status_code == 200, r.text

    person = await db_session.get(Person, volunteer["id"])
    assert person.oidc_subject == "subject-a"
    # The admin-entered name/help periods survive — registering only linked, it didn't overwrite.
    assert person.name == "Sofie De Smet"

    audits = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "volunteer_identity_registered",
                AuditEntry.resource_id == volunteer["id"],
            )
        )
    ).all()
    assert audits[0].details["linked_existing_record"] is True

    # No duplicate Person was created.
    count = (await db_session.scalars(select(Person).where(Person.national_register_number == NISS_A))).all()
    assert len(count) == 1


@pytest.mark.anyio
async def test_register_conflicts_with_an_already_linked_existing_record(client, volunteer_client_as):
    volunteer = await _create_volunteer(client)
    r = await client.put(
        f"/api/volunteers/{volunteer['id']}", json={"oidc_subject": "existing-owner"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200

    async with volunteer_client_as("subject-b") as vclient:
        conflict = await _register(vclient)
        assert conflict.status_code == 409


@pytest.mark.anyio
async def test_register_conflicts_on_a_partial_match(client, volunteer_client_as):
    """The NISS matches an existing person but the eID doesn't (or vice versa) —
    never silently create a duplicate or attach to the wrong record."""
    await _create_volunteer(client)

    async with volunteer_client_as("subject-a") as vclient:
        r = await _register(vclient, niss=NISS_A, eid=EID_B)
        assert r.status_code == 409


@pytest.mark.anyio
async def test_eid_correction_requires_a_linked_volunteer(volunteer_client_as):
    async with volunteer_client_as() as vclient:
        r = await vclient.post(
            "/api/me/volunteer/eid-correction",
            json={"eid_document_number": EID_B},
        )
        assert r.status_code == 404


@pytest.mark.anyio
async def test_eid_correction_writes_directly_and_is_idempotent(volunteer_client_as, db_session):
    async with volunteer_client_as("subject-a") as vclient:
        registered = await _register(vclient)
        assert registered.status_code == 200

        body = {"eid_document_number": EID_B}
        first = await vclient.post("/api/me/volunteer/eid-correction", json=body)
        replay = await vclient.post("/api/me/volunteer/eid-correction", json=body)
        assert first.status_code == replay.status_code == 200
        assert first.json()["eid_document_number"] == EID_B
        assert replay.json() == first.json()

    person = (await db_session.scalars(select(Person).where(Person.oidc_subject == "subject-a"))).one()
    # Now a direct write, unlike the earlier admin-reviewed design.
    assert person.eid_document_number == EID_B

    audits = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "volunteer_eid_updated",
                AuditEntry.resource_id == person.id,
            )
        )
    ).all()
    # Only the first request actually changed the value — the idempotent
    # replay writes the same value again and doesn't re-audit a non-change.
    assert len(audits) == 1
    # No raw eID values in the audit trail — see volunteer_self_service.
    assert EID_B not in str(audits[0].details)


@pytest.mark.anyio
async def test_eid_correction_rejects_invalid_checksum(volunteer_client_as):
    async with volunteer_client_as("subject-a") as vclient:
        registered = await _register(vclient)
        assert registered.status_code == 200

        r = await vclient.post("/api/me/volunteer/eid-correction", json={"eid_document_number": "999999999999"})
        assert r.status_code == 422


@pytest.mark.anyio
async def test_eid_correction_conflicts_with_an_eid_already_on_file(client, volunteer_client_as):
    """The new eID number belongs to someone else's record — reject rather
    than silently taking over their identity number."""
    await _create_volunteer(client, national_register_number=NISS_B, eid_document_number=EID_B)

    async with volunteer_client_as("subject-a") as vclient:
        registered = await _register(vclient)
        assert registered.status_code == 200

        r = await vclient.post("/api/me/volunteer/eid-correction", json={"eid_document_number": EID_B})
        assert r.status_code == 409


@pytest.mark.anyio
async def test_admin_can_hand_link_and_unlink_via_volunteer_update(client, db_session):
    volunteer = await _create_volunteer(client)

    r = await client.put(
        f"/api/volunteers/{volunteer['id']}", json={"oidc_subject": "admin-linked-subject"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert r.json()["oidc_subject"] == "admin-linked-subject"

    person = await db_session.get(Person, volunteer["id"])
    assert person.oidc_subject == "admin-linked-subject"

    r = await client.put(f"/api/volunteers/{volunteer['id']}", json={"oidc_subject": None}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["oidc_subject"] is None


@pytest.mark.anyio
async def test_admin_cannot_link_two_volunteers_to_the_same_subject(client):
    volunteer_1 = await _create_volunteer(client, national_register_number=NISS_A, eid_document_number=EID_A)
    volunteer_2 = await _create_volunteer(
        client, name="Other Person", national_register_number=NISS_B, eid_document_number=EID_B
    )

    r = await client.put(
        f"/api/volunteers/{volunteer_1['id']}", json={"oidc_subject": "shared-subject"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200

    r = await client.put(
        f"/api/volunteers/{volunteer_2['id']}", json={"oidc_subject": "shared-subject"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 409
