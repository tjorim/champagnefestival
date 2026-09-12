"""Integration tests for /api/me/* self-service endpoints."""

from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from typing import cast

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

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
    ReservationAccessToken,
    User,
)
from app.routers import me as me_router
from app.routers import registrations as registrations_router
from app.schemas import RegistrationAccessLookupRequest
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
    ``app.visitor_session.get_current_user``, unlike ``me_client`` (which
    overrides that dependency wholesale). Needed to test the auto-claim
    behavior embedded inside it, since an override would bypass that code
    entirely. Pair with ``monkeypatch.setattr(visitor_session_module,
    "decode_token", ...)`` to control the bearer token's claims.
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
async def test_claim_registrations_links_email_proven_bookings(me_client, db_session):
    response = await _post_registration_with_admin_setup(me_client, email="claimed@example.com")
    assert response.status_code == 201
    registration_id = response.json()["id"]
    token = "claim-token-with-sufficient-length"
    now = datetime.now(UTC)
    db_session.add(
        ReservationAccessToken(
            id="rat-claim",
            email="claimed@example.com",
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=now + timedelta(minutes=30),
            created_at=now,
        )
    )
    await db_session.commit()

    claimed = await me_client.post("/api/me/registrations/claim", json={"token": token})
    assert claimed.status_code == 200
    assert [item["id"] for item in claimed.json()] == [registration_id]

    registration = await db_session.get(Registration, registration_id)
    user = await db_session.scalar(select(User).where(User.oidc_subject == "visitor-sub"))
    assert registration is not None and user is not None
    await db_session.refresh(registration)
    assert registration.user_id == user.id
    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "registration_claimed",
            AuditEntry.resource_id == registration_id,
        )
    )
    assert audit is not None

    owned = await me_client.get("/api/me/registrations")
    assert owned.status_code == 200
    assert [item["id"] for item in owned.json()] == [registration_id]
    assert owned.json()[0]["check_in_token"]

    pebble_response = await me_client.post("/api/me/pebble-token")
    pebble_token = pebble_response.json()["token"]
    glance = await me_client.get(
        "/api/pebble/registrations",
        headers={"Authorization": f"Bearer {pebble_token}"},
    )
    assert glance.status_code == 200
    assert [item["id"] for item in glance.json()] == [registration_id]

    replay = await me_client.post("/api/me/registrations/claim", json={"token": token})
    assert replay.status_code == 401


@pytest.mark.anyio
async def test_concurrent_first_use_claims_only_allow_one_owner(
    me_client,
    db_session,
    engine,
    monkeypatch,
):
    response = await _post_registration_with_admin_setup(me_client, email="race-claim@example.com")
    registration_id = response.json()["id"]
    token = "concurrent-claim-token-with-sufficient-length"
    now = datetime.now(UTC)
    db_session.add(
        ReservationAccessToken(
            id="rat-concurrent-claim",
            email="race-claim@example.com",
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=now + timedelta(minutes=30),
            created_at=now,
        )
    )
    await db_session.commit()

    # User resolution now happens in the get_current_user dependency, outside
    # claim_my_registrations itself (#953), so the deterministic pause moves
    # to _get_guest_access_token_or_401 — the row lock that actually
    # serializes two concurrent claims of the same token in production.
    # Pausing there, right after acquiring that lock, reproduces the same
    # race the original test drove through user provisioning.
    first_locked = asyncio.Event()
    release_first = asyncio.Event()
    original_get_token = registrations_router._get_guest_access_token_or_401
    paused = False

    async def pause_first_lookup(db, tok):
        nonlocal paused
        token_row = await original_get_token(db, tok)
        if not paused:
            paused = True
            first_locked.set()
            await release_first.wait()
        return token_row

    monkeypatch.setattr(registrations_router, "_get_guest_access_token_or_401", pause_first_lookup)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    body = RegistrationAccessLookupRequest(token=token)

    async def attempt_claim(subject: str):
        async with session_factory() as session:
            user = await users_service.get_or_create_user(session, subject)
            try:
                return await me_router.claim_my_registrations(body, user, session)
            except HTTPException as exc:
                return exc.status_code

    first_task = asyncio.create_task(attempt_claim("first-claim-sub"))
    await asyncio.wait_for(first_locked.wait(), timeout=2)
    second_task = asyncio.create_task(attempt_claim("second-claim-sub"))
    await asyncio.sleep(0.05)
    release_first.set()
    outcomes = await asyncio.wait_for(asyncio.gather(first_task, second_task), timeout=2)

    assert sum(isinstance(outcome, list) for outcome in outcomes) == 1
    assert outcomes.count(401) == 1
    async with session_factory() as assertion_session:
        registration = await assertion_session.get(Registration, registration_id)
        assert registration is not None
        assert registration.user_id is not None
        owner = await assertion_session.get(User, registration.user_id)
        assert owner is not None
        assert owner.oidc_subject == "first-claim-sub"
        audits = (
            await assertion_session.scalars(
                select(AuditEntry).where(
                    AuditEntry.action == "registration_claimed",
                    AuditEntry.resource_id == registration_id,
                )
            )
        ).all()
        assert len(audits) == 1


@pytest.mark.anyio
async def test_claim_registrations_does_not_reassign_owned_booking(me_client, db_session):
    response = await _post_registration_with_admin_setup(me_client, email="owned@example.com")
    registration_id = response.json()["id"]
    existing_owner = User(id="usr-existing-owner", oidc_subject="existing-owner-sub")
    registration = await db_session.get(Registration, registration_id)
    assert registration is not None
    db_session.add(existing_owner)
    registration.user_id = existing_owner.id
    token = "owned-claim-token-with-sufficient-length"
    now = datetime.now(UTC)
    db_session.add(
        ReservationAccessToken(
            id="rat-owned-claim",
            email="owned@example.com",
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=now + timedelta(minutes=30),
            created_at=now,
        )
    )
    await db_session.commit()

    claimed = await me_client.post("/api/me/registrations/claim", json={"token": token})

    assert claimed.status_code == 200
    await db_session.refresh(registration)
    assert registration.user_id == existing_owner.id
    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "registration_claimed",
            AuditEntry.resource_id == registration_id,
        )
    )
    assert audit is None


@pytest.mark.anyio
async def test_auto_claims_unowned_registration_for_a_verified_oidc_email(raw_client, db_session, monkeypatch):
    """#1044: a signed-in caller's own verified email auto-claims a booking
    made under that same address while signed out — no token, no form.
    """
    response = await _post_registration_with_admin_setup(raw_client, email="auto-claim@example.com")
    registration_id = response.json()["id"]
    registration = await db_session.get(Registration, registration_id)
    assert registration is not None
    assert registration.user_id is None

    async def fake_decode_token(_token: str) -> dict:
        return {"sub": "auto-claim-sub", "email": "auto-claim@example.com", "email_verified": True}

    monkeypatch.setattr(visitor_session_module, "decode_token", fake_decode_token)

    result = await raw_client.get("/api/me/registrations", headers={"Authorization": "Bearer auto-claim-token"})

    assert result.status_code == 200
    assert [item["id"] for item in result.json()] == [registration_id]
    await db_session.refresh(registration)
    user = await db_session.scalar(select(User).where(User.oidc_subject == "auto-claim-sub"))
    assert user is not None
    assert registration.user_id == user.id
    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "registration_claimed",
            AuditEntry.resource_id == registration_id,
        )
    )
    assert audit is not None
    assert audit.actor == "auto-claim-sub"


@pytest.mark.anyio
async def test_does_not_auto_claim_without_an_email_verified_claim(raw_client, db_session, monkeypatch):
    """An unverified email is self-asserted, not Keycloak's own attestation —
    same trust bar #1006 uses for volunteer identity, so it stays unclaimed
    and falls back to the manual proof-token flow instead.
    """
    response = await _post_registration_with_admin_setup(raw_client, email="unverified@example.com")
    registration_id = response.json()["id"]

    async def fake_decode_token(_token: str) -> dict:
        return {"sub": "unverified-sub", "email": "unverified@example.com", "email_verified": False}

    monkeypatch.setattr(visitor_session_module, "decode_token", fake_decode_token)

    result = await raw_client.get("/api/me/registrations", headers={"Authorization": "Bearer unverified-token"})

    assert result.status_code == 200
    assert result.json() == []
    registration = await db_session.get(Registration, registration_id)
    assert registration is not None
    assert registration.user_id is None
    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "registration_claimed",
            AuditEntry.resource_id == registration_id,
        )
    )
    assert audit is None


@pytest.mark.anyio
async def test_auto_claim_is_idempotent_across_repeated_requests(raw_client, db_session, monkeypatch):
    response = await _post_registration_with_admin_setup(raw_client, email="repeat-claim@example.com")
    registration_id = response.json()["id"]

    async def fake_decode_token(_token: str) -> dict:
        return {"sub": "repeat-claim-sub", "email": "repeat-claim@example.com", "email_verified": True}

    monkeypatch.setattr(visitor_session_module, "decode_token", fake_decode_token)

    first = await raw_client.get("/api/me/registrations", headers={"Authorization": "Bearer repeat-claim-token"})
    second = await raw_client.get("/api/me/registrations", headers={"Authorization": "Bearer repeat-claim-token"})

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
