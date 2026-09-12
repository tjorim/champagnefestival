"""Integration tests for /api/me/* self-service endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import email as email_module
from app import visitor_session as visitor_session_module
from app.auth import require_admin
from app.database import async_session_factory, get_db
from app.main import app
from app.models import (
    AuditEntry,
    ContactMessage,
    OutboxJob,
    PebbleAccessToken,
    Registration,
    User,
)
from app.routers import me as me_router
from app.services import users_service
from app.services.outbox_service import CONTACT_NOTIFICATION, REGISTRATION_CONFIRMATION, process_one_job
from app.services.pebble_access import rotate_pebble_token
from tests.helpers import _post_registration

ADMIN_HEADERS = {"Authorization": "Bearer admin-token"}


async def _post_registration_with_admin_setup(me_client, **overrides):
    """Temporarily authorize the admin-only event setup used by the public booking helper."""
    app.dependency_overrides[require_admin] = lambda: None
    try:
        return await _post_registration(me_client, **overrides)
    finally:
        app.dependency_overrides.pop(require_admin, None)


@pytest.fixture()
async def raw_client(db_session):
    """Client with no auth override at all — goes through the real
    ``app.visitor_session.get_current_user``/``get_current_user_with_claims``,
    unlike ``me_client`` (which overrides those dependencies wholesale).
    Needed to test the confirm-first claim flow (#1044), which depends on the
    caller's raw OIDC claims (their own verified email), since an override
    would bypass that resolution entirely. Pair with
    ``monkeypatch.setattr(visitor_session_module, "decode_token", ...)`` to
    control the bearer token's claims.
    """

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


class _RacingUserSession:
    def __init__(self, existing_user: User):
        self.results = [None, existing_user]
        self.added_user: User | None = None
        self.rolled_back = False
        self.refreshed_user: User | None = None

    async def scalar(self, _statement):
        return self.results.pop(0)

    def add(self, user: User) -> None:
        self.added_user = user

    async def commit(self) -> None:
        raise IntegrityError("insert users", {}, Exception("duplicate oidc_subject"))

    async def rollback(self) -> None:
        self.rolled_back = True

    async def refresh(self, user: User) -> None:
        self.refreshed_user = user


@pytest.mark.anyio
async def test_get_or_create_user_recovers_from_concurrent_insert(monkeypatch):
    existing_user = User(id="usr-existing", oidc_subject="visitor-sub")
    session = _RacingUserSession(existing_user)
    monkeypatch.setattr(users_service, "make_id", lambda _prefix: "usr-new")

    user = await users_service.get_or_create_user(cast(AsyncSession, session), "visitor-sub")

    assert user is existing_user
    assert session.added_user is not None
    assert session.added_user.oidc_subject == "visitor-sub"
    assert session.rolled_back is True
    assert session.refreshed_user is existing_user


@pytest.mark.anyio
async def test_me_registrations_empty_for_new_user(me_client):
    """A freshly provisioned user has no registrations."""
    r = await me_client.get("/api/me/registrations")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.anyio
async def test_me_registrations_auto_provisions_user(me_client, db_session):
    """Calling /api/me/registrations creates a User record if none exists."""
    from sqlalchemy import select

    from app.models import User

    r = await me_client.get("/api/me/registrations")
    assert r.status_code == 200

    result = await db_session.execute(select(User).where(User.oidc_subject == "visitor-sub"))
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.oidc_subject == "visitor-sub"


@pytest.mark.anyio
async def test_booking_cancellation_request_does_not_cancel_and_replays_safely(me_client, db_session):
    await me_client.get("/api/me/registrations")
    created = await _post_registration_with_admin_setup(me_client, email="request@example.com")
    registration_id = created.json()["id"]
    user = await db_session.scalar(select(User).where(User.oidc_subject == "visitor-sub"))
    registration = await db_session.get(Registration, registration_id)
    assert user is not None and registration is not None
    registration.user_id = user.id
    await db_session.commit()

    body = {
        "submission_id": "27d6a186-ded1-45b9-af20-2061bb739436",
        "request_type": "cancellation",
        "details": "Please cancel both tables.",
    }
    first = await me_client.post(f"/api/me/registrations/{registration_id}/request", json=body)
    replay = await me_client.post(f"/api/me/registrations/{registration_id}/request", json=body)
    assert first.status_code == replay.status_code == 200

    await db_session.refresh(registration)
    assert registration.status != "cancelled"
    stored = await db_session.get(ContactMessage, body["submission_id"])
    assert stored is not None
    assert registration_id in stored.message
    audits = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "registration_change_requested",
                AuditEntry.resource_id == registration_id,
            )
        )
    ).all()
    assert len(audits) == 1

    # Notification delivery is enqueued once, atomically with the message —
    # a replay of this idempotent submission must not enqueue a second job
    # (its deduplication_key is unique) nor skip delivery outright.
    jobs = (
        await db_session.scalars(
            select(OutboxJob).where(OutboxJob.deduplication_key == f"contact-notification:{body['submission_id']}")
        )
    ).all()
    assert len(jobs) == 1
    assert jobs[0].job_type == CONTACT_NOTIFICATION
    assert jobs[0].state == "pending"


@pytest.mark.anyio
async def test_booking_change_request_notification_retries_after_failure_then_delivers(
    me_client, db_session, monkeypatch
):
    """A transient delivery failure must not be lost — the outbox worker retries it (#retry-safety)."""
    await me_client.get("/api/me/registrations")
    created = await _post_registration_with_admin_setup(me_client, email="retry-request@example.com")
    registration_id = created.json()["id"]
    user = await db_session.scalar(select(User).where(User.oidc_subject == "visitor-sub"))
    registration = await db_session.get(Registration, registration_id)
    assert user is not None and registration is not None
    registration.user_id = user.id
    await db_session.commit()

    attempts = 0

    async def flaky_send(**_kwargs):
        nonlocal attempts
        attempts += 1
        return attempts > 1

    monkeypatch.setattr(email_module, "send_contact_notification", flaky_send)
    submission_id = "9c6a4e0a-2f3a-4b8e-9a0d-6a2b8f7c1e11"
    response = await me_client.post(
        f"/api/me/registrations/{registration_id}/request",
        json={"submission_id": submission_id, "request_type": "cancellation", "details": "Retry check."},
    )
    assert response.status_code == 200

    async def _delivered(_resource_id: str) -> bool:
        return True

    handlers = {
        REGISTRATION_CONFIRMATION: _delivered,  # drain the booking's own confirmation job first
        CONTACT_NOTIFICATION: email_module.deliver_contact_notification,
    }
    assert await process_one_job(async_session_factory, handlers) is True
    assert await process_one_job(async_session_factory, handlers) is True
    job = await db_session.scalar(
        select(OutboxJob).where(OutboxJob.deduplication_key == f"contact-notification:{submission_id}")
    )
    assert job is not None
    assert attempts == 1
    assert job.state == "pending"  # first attempt failed; rescheduled for retry

    job.scheduled_at = datetime.now(UTC)
    await db_session.commit()
    assert await process_one_job(async_session_factory, handlers) is True
    await db_session.refresh(job)
    assert attempts == 2
    assert job.state == "delivered"


@pytest.mark.anyio
async def test_lists_claimable_registrations_without_linking_them(raw_client, db_session, monkeypatch):
    """#1044: a verified email surfaces a candidate to *preview* — nothing is
    linked by the GET itself, unlike an earlier, silent version of this
    feature.
    """
    response = await _post_registration_with_admin_setup(raw_client, email="claimable@example.com")
    registration_id = response.json()["id"]
    registration = await db_session.get(Registration, registration_id)
    assert registration is not None
    assert registration.user_id is None

    async def fake_decode_token(_token: str) -> dict:
        return {"sub": "claimable-sub", "email": "claimable@example.com", "email_verified": True}

    monkeypatch.setattr(visitor_session_module, "decode_token", fake_decode_token)

    result = await raw_client.get(
        "/api/me/registrations/claimable", headers={"Authorization": "Bearer claimable-token"}
    )

    assert result.status_code == 200
    assert [item["id"] for item in result.json()] == [registration_id]
    await db_session.refresh(registration)
    assert registration.user_id is None
    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "registration_claimed",
            AuditEntry.resource_id == registration_id,
        )
    )
    assert audit is None


@pytest.mark.anyio
async def test_claim_verified_email_links_after_explicit_confirmation(raw_client, db_session, monkeypatch):
    response = await _post_registration_with_admin_setup(raw_client, email="confirm-claim@example.com")
    registration_id = response.json()["id"]

    async def fake_decode_token(_token: str) -> dict:
        return {"sub": "confirm-claim-sub", "email": "confirm-claim@example.com", "email_verified": True}

    monkeypatch.setattr(visitor_session_module, "decode_token", fake_decode_token)

    result = await raw_client.post(
        "/api/me/registrations/claim-verified-email", headers={"Authorization": "Bearer confirm-claim-token"}
    )

    assert result.status_code == 200
    assert [item["id"] for item in result.json()] == [registration_id]
    registration = await db_session.get(Registration, registration_id)
    assert registration is not None
    user = await db_session.scalar(select(User).where(User.oidc_subject == "confirm-claim-sub"))
    assert user is not None
    assert registration.user_id == user.id
    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "registration_claimed",
            AuditEntry.resource_id == registration_id,
        )
    )
    assert audit is not None
    assert audit.actor == "confirm-claim-sub"


@pytest.mark.anyio
async def test_claimable_and_claim_verified_email_require_email_verified(raw_client, db_session, monkeypatch):
    """An unverified email is self-asserted, not Keycloak's own attestation —
    same trust bar #1006 uses for volunteer identity, so neither endpoint
    treats it as a match; the manual proof-token flow remains available.
    """
    response = await _post_registration_with_admin_setup(raw_client, email="unverified@example.com")
    registration_id = response.json()["id"]

    async def fake_decode_token(_token: str) -> dict:
        return {"sub": "unverified-sub", "email": "unverified@example.com", "email_verified": False}

    monkeypatch.setattr(visitor_session_module, "decode_token", fake_decode_token)

    preview = await raw_client.get(
        "/api/me/registrations/claimable", headers={"Authorization": "Bearer unverified-token"}
    )
    claim = await raw_client.post(
        "/api/me/registrations/claim-verified-email", headers={"Authorization": "Bearer unverified-token"}
    )

    assert preview.status_code == 200
    assert preview.json() == []
    assert claim.status_code == 409
    registration = await db_session.get(Registration, registration_id)
    assert registration is not None
    assert registration.user_id is None


@pytest.mark.anyio
async def test_claim_verified_email_is_idempotent_across_repeated_confirmations(raw_client, db_session, monkeypatch):
    response = await _post_registration_with_admin_setup(raw_client, email="repeat-claim@example.com")
    registration_id = response.json()["id"]

    async def fake_decode_token(_token: str) -> dict:
        return {"sub": "repeat-claim-sub", "email": "repeat-claim@example.com", "email_verified": True}

    monkeypatch.setattr(visitor_session_module, "decode_token", fake_decode_token)

    first = await raw_client.post(
        "/api/me/registrations/claim-verified-email", headers={"Authorization": "Bearer repeat-claim-token"}
    )
    second = await raw_client.post(
        "/api/me/registrations/claim-verified-email", headers={"Authorization": "Bearer repeat-claim-token"}
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert [item["id"] for item in second.json()] == [registration_id]
    audits = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "registration_claimed",
                AuditEntry.resource_id == registration_id,
            )
        )
    ).all()
    assert len(audits) == 1


@pytest.mark.anyio
async def test_pebble_token_is_scoped_and_rotates(me_client, db_session):
    first = await me_client.post("/api/me/pebble-token")
    assert first.status_code == 200
    assert first.headers["cache-control"] == "no-store"
    first_token = first.json()["token"]
    assert first_token.startswith("cfpat_")

    glance = await me_client.get(
        "/api/pebble/registrations",
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert glance.status_code == 200
    assert glance.json() == []

    second = await me_client.post("/api/me/pebble-token")
    assert second.status_code == 200
    second_token = second.json()["token"]
    assert second_token != first_token

    revoked = await me_client.get(
        "/api/pebble/registrations",
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert revoked.status_code == 401

    active = await me_client.get(
        "/api/pebble/registrations",
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert active.status_code == 200

    rows = (await db_session.execute(select(PebbleAccessToken))).scalars().all()
    assert len(rows) == 1
    assert rows[0].token_hash not in {first_token, second_token}


@pytest.mark.anyio
async def test_pebble_token_can_be_revoked(me_client):
    created = await me_client.post("/api/me/pebble-token")
    token = created.json()["token"]

    response = await me_client.delete("/api/me/pebble-token")
    assert response.status_code == 204

    glance = await me_client.get(
        "/api/pebble/registrations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert glance.status_code == 401


@pytest.mark.anyio
async def test_pebble_token_cannot_access_oidc_self_service(client, db_session):
    user = User(id="usr-pebble-isolation", oidc_subject="pebble-isolation-sub")
    db_session.add(user)
    await db_session.commit()
    token = await rotate_pebble_token(db_session, user.id)
    headers = {"Authorization": f"Bearer {token}"}

    glance = await client.get("/api/pebble/registrations", headers=headers)
    self_service = await client.get("/api/me/registrations", headers=headers)

    assert glance.status_code == 200
    assert self_service.status_code == 401


@pytest.mark.anyio
async def test_delete_me_unlinks_account_without_deleting_registration(me_client, client, db_session):
    """Deleting a portal account keeps reservation/order records for operations."""
    user = User(id="usr-visitor", oidc_subject="visitor-sub")
    db_session.add(user)
    response = await _post_registration(client)
    assert response.status_code == 201
    registration_id = response.json()["id"]

    registration = await db_session.get(Registration, registration_id)
    assert registration is not None
    registration.user_id = user.id
    await db_session.commit()

    delete_response = await me_client.delete("/api/me")
    assert delete_response.status_code == 204

    deleted_user = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
    assert deleted_user is None

    retained_registration = await db_session.get(Registration, registration_id)
    assert retained_registration is not None
    await db_session.refresh(retained_registration)
    assert retained_registration.user_id is None
    assert isinstance(retained_registration.order_items, list)


@pytest.mark.anyio
async def test_authenticated_visitor_can_update_communication_preference(me_client, db_session):
    response = await _post_registration_with_admin_setup(me_client, email="language@example.com")
    assert response.status_code == 201
    await me_client.get("/api/me/registrations")
    user = await db_session.scalar(select(User).where(User.oidc_subject == "visitor-sub"))
    registration = await db_session.get(Registration, response.json()["id"])
    registration.user_id = user.id
    await db_session.commit()

    updated = await me_client.put("/api/me/communication-preference", json={"preferred_language": "fr"})
    assert updated.status_code == 200
    assert updated.json() == {"preferred_language": "fr"}
    fetched = await me_client.get("/api/me/communication-preference")
    assert fetched.json() == {"preferred_language": "fr"}

    registration = await db_session.get(Registration, response.json()["id"])
    person = await db_session.get(me_router.Person, registration.person_id)
    assert person.preferred_language == "fr"
    audits = (
        await db_session.scalars(select(AuditEntry).where(AuditEntry.action == "communication_preference_updated"))
    ).all()
    assert len(audits) == 1

    repeated = await me_client.put("/api/me/communication-preference", json={"preferred_language": "fr"})
    assert repeated.status_code == 200
    audits = (
        await db_session.scalars(select(AuditEntry).where(AuditEntry.action == "communication_preference_updated"))
    ).all()
    assert len(audits) == 1
