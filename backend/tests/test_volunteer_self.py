"""Integration tests for /api/me/volunteer/* self-service identity endpoints (#1006)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditEntry, ContactMessage, OutboxJob, Person
from app.services.outbox_service import CONTACT_NOTIFICATION
from tests.helpers import ADMIN_HEADERS

VOLUNTEER_PAYLOAD = {
    "name": "Sofie De Smet",
    "address": "Dorpsstraat 12, 8450 Bredene",
    "national_register_number": "91010112345",
    "eid_document_number": "BEX123456",
    "active": True,
    "help_periods": [{"first_help_day": "2024-03-15", "last_help_day": "2024-03-17"}],
}


async def _create_volunteer(client, **overrides) -> dict:
    payload = {**VOLUNTEER_PAYLOAD, **overrides}
    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    return r.json()


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
async def test_claim_links_matching_volunteer_by_niss(client, volunteer_client_as, db_session):
    volunteer = await _create_volunteer(client)

    async with volunteer_client_as("subject-a") as vclient:
        r = await vclient.post("/api/me/volunteer/claim", json={"national_register_number": "91.01.01-123.45"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["linked"] is True
        assert body["name"] == volunteer["name"]
        assert body["eid_document_number"] == volunteer["eid_document_number"]

        get_r = await vclient.get("/api/me/volunteer")
        assert get_r.status_code == 200
        assert get_r.json()["linked"] is True
        assert get_r.json()["national_register_number"] == volunteer["national_register_number"]

    person = await db_session.get(Person, volunteer["id"])
    assert person.oidc_subject == "subject-a"
    audits = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "volunteer_identity_claimed",
                AuditEntry.resource_id == volunteer["id"],
            )
        )
    ).all()
    assert len(audits) == 1


@pytest.mark.anyio
async def test_claim_raises_an_admin_visible_notification(client, volunteer_client_as, db_session):
    """A successful claim can't be verified as the true owner (#1037 review) — an
    admin notification is the detection control that makes a wrongful claim noticeable."""
    volunteer = await _create_volunteer(client)

    async with volunteer_client_as("subject-a") as vclient:
        r = await vclient.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer["national_register_number"]}
        )
        assert r.status_code == 200

    notifications = (
        await db_session.scalars(
            select(ContactMessage).where(ContactMessage.message.contains("Volunteer identity self-linked"))
        )
    ).all()
    assert len(notifications) == 1
    assert volunteer["id"] in notifications[0].message

    jobs = (
        await db_session.scalars(
            select(OutboxJob).where(OutboxJob.deduplication_key == f"contact-notification:{notifications[0].id}")
        )
    ).all()
    assert len(jobs) == 1
    assert jobs[0].job_type == CONTACT_NOTIFICATION


@pytest.mark.anyio
async def test_claim_retry_with_same_subject_and_niss_is_idempotent(client, volunteer_client_as):
    volunteer = await _create_volunteer(client)

    async with volunteer_client_as("subject-a") as vclient:
        first = await vclient.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer["national_register_number"]}
        )
        second = await vclient.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer["national_register_number"]}
        )
        assert first.status_code == second.status_code == 200
        assert first.json() == second.json()


@pytest.mark.anyio
async def test_claim_with_no_matching_volunteer_is_404(volunteer_client_as):
    async with volunteer_client_as("subject-a") as vclient:
        r = await vclient.post("/api/me/volunteer/claim", json={"national_register_number": "00000000000"})
        assert r.status_code == 404


@pytest.mark.anyio
async def test_claim_already_linked_to_different_record_is_409(client, volunteer_client_as):
    volunteer_1 = await _create_volunteer(client, national_register_number="91010112345", eid_document_number="BEX1")
    volunteer_2 = await _create_volunteer(
        client, name="Other Person", national_register_number="91010154321", eid_document_number="BEX2"
    )

    async with volunteer_client_as("subject-a") as vclient:
        first = await vclient.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer_1["national_register_number"]}
        )
        assert first.status_code == 200

        conflict = await vclient.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer_2["national_register_number"]}
        )
        assert conflict.status_code == 409


@pytest.mark.anyio
async def test_second_subject_cannot_claim_an_already_linked_record(client, volunteer_client_as):
    volunteer = await _create_volunteer(client)

    async with volunteer_client_as("subject-a") as vclient_a:
        first = await vclient_a.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer["national_register_number"]}
        )
        assert first.status_code == 200

    async with volunteer_client_as("subject-b") as vclient_b:
        second = await vclient_b.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer["national_register_number"]}
        )
        assert second.status_code == 404


@pytest.mark.anyio
async def test_claim_is_rate_limited_per_subject(volunteer_client_as):
    async with volunteer_client_as("subject-rl") as vclient:
        for _ in range(5):
            r = await vclient.post("/api/me/volunteer/claim", json={"national_register_number": "00000000000"})
            assert r.status_code == 404
        limited = await vclient.post("/api/me/volunteer/claim", json={"national_register_number": "00000000000"})
        assert limited.status_code == 429


@pytest.mark.anyio
async def test_eid_correction_requires_a_linked_volunteer(volunteer_client_as):
    async with volunteer_client_as() as vclient:
        r = await vclient.post(
            "/api/me/volunteer/eid-correction",
            json={
                "submission_id": "27d6a186-ded1-45b9-af20-2061bb739436",
                "new_eid_document_number": "BEX999999",
            },
        )
        assert r.status_code == 404


@pytest.mark.anyio
async def test_eid_correction_creates_contact_message_and_is_idempotent(client, volunteer_client_as, db_session):
    volunteer = await _create_volunteer(client)
    submission_id = "9c6a4e0a-2f3a-4b8e-9a0d-6a2b8f7c1e11"

    async with volunteer_client_as("subject-a") as vclient:
        claim = await vclient.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer["national_register_number"]}
        )
        assert claim.status_code == 200

        body = {"submission_id": submission_id, "new_eid_document_number": "BEX999999", "note": "Card renewed."}
        first = await vclient.post("/api/me/volunteer/eid-correction", json=body)
        replay = await vclient.post("/api/me/volunteer/eid-correction", json=body)
        assert first.status_code == replay.status_code == 202
        assert first.json() == replay.json() == {"submitted": True}

    # The Person row is untouched — a correction is admin-reviewed, not a direct write.
    person = await db_session.get(Person, volunteer["id"])
    assert person.eid_document_number == volunteer["eid_document_number"]

    stored = await db_session.get(ContactMessage, submission_id)
    assert stored is not None
    assert volunteer["id"] in stored.message
    assert "BEX999999" in stored.message

    audits = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "volunteer_eid_correction_requested",
                AuditEntry.resource_id == volunteer["id"],
            )
        )
    ).all()
    assert len(audits) == 1
    # No raw eID values in the audit trail — see volunteer_self_service.
    assert "BEX999999" not in str(audits[0].details)

    jobs = (
        await db_session.scalars(
            select(OutboxJob).where(OutboxJob.deduplication_key == f"contact-notification:{submission_id}")
        )
    ).all()
    assert len(jobs) == 1
    assert jobs[0].job_type == CONTACT_NOTIFICATION


@pytest.mark.anyio
async def test_eid_correction_reused_submission_id_with_different_payload_is_409(
    client, volunteer_client_as, db_session
):
    """The frontend keeps submission_id fixed across a failed attempt even if the
    volunteer edits the form before retrying, so a reused id with different content
    is a distinct correction, not a replay — it must not be silently dropped (#1037 review)."""
    volunteer = await _create_volunteer(client)
    submission_id = "1b1b1b1b-2c2c-3d3d-4e4e-5f5f5f5f5f5f"

    async with volunteer_client_as("subject-a") as vclient:
        claim = await vclient.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer["national_register_number"]}
        )
        assert claim.status_code == 200

        first = await vclient.post(
            "/api/me/volunteer/eid-correction",
            json={"submission_id": submission_id, "new_eid_document_number": "BEX111111", "note": "First try."},
        )
        assert first.status_code == 202

        mismatched = await vclient.post(
            "/api/me/volunteer/eid-correction",
            json={"submission_id": submission_id, "new_eid_document_number": "BEX222222", "note": "Edited try."},
        )
        assert mismatched.status_code == 409

    stored = await db_session.get(ContactMessage, submission_id)
    assert "BEX111111" in stored.message
    assert "BEX222222" not in stored.message


@pytest.mark.anyio
async def test_eid_correction_is_rate_limited_per_subject(client, volunteer_client_as):
    volunteer = await _create_volunteer(client)

    async with volunteer_client_as("subject-rl") as vclient:
        claim = await vclient.post(
            "/api/me/volunteer/claim", json={"national_register_number": volunteer["national_register_number"]}
        )
        assert claim.status_code == 200

        for i in range(5):
            r = await vclient.post(
                "/api/me/volunteer/eid-correction",
                json={"submission_id": f"2b2b2b2b-3c3c-4d4d-5e5e-6f6f6f6f6f6{i}", "new_eid_document_number": "BEX1"},
            )
            assert r.status_code == 202
        limited = await vclient.post(
            "/api/me/volunteer/eid-correction",
            json={"submission_id": "2b2b2b2b-3c3c-4d4d-5e5e-6f6f6f6f6fff", "new_eid_document_number": "BEX1"},
        )
        assert limited.status_code == 429


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
    volunteer_1 = await _create_volunteer(client, national_register_number="91010112345", eid_document_number="BEX1")
    volunteer_2 = await _create_volunteer(
        client, name="Other Person", national_register_number="91010154321", eid_document_number="BEX2"
    )

    r = await client.put(
        f"/api/volunteers/{volunteer_1['id']}", json={"oidc_subject": "shared-subject"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200

    r = await client.put(
        f"/api/volunteers/{volunteer_2['id']}", json={"oidc_subject": "shared-subject"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 409
