"""Tests for #953's passwordless visitor magic-link session.

Covers the acceptance criteria explicitly called out as needing test
coverage: replay, expiry, concurrent redemption, enumeration resistance,
and existing-owner protection — plus the scope-limit requirement (a visitor
session must never satisfy require_admin/require_volunteer) and the
sliding-idle/hard-cap session lifetime (docs/decisions/953-visitor-passwordless-session.md).
"""

from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import AuditEntry, Registration, User, VisitorMagicLink, VisitorSession
from app.visitor_session import (
    SESSION_HARD_CAP,
    SESSION_IDLE_TIMEOUT,
    cleanup_expired_magic_links,
    cleanup_expired_sessions,
)
from tests.helpers import _post_registration


def _capture_sent_token(monkeypatch) -> list[str]:
    """Monkeypatch send_visitor_magic_link_email to capture the token instead of emailing it."""
    import app.routers.visitor_auth as visitor_auth_module

    captured: list[str] = []

    async def fake_send(*, email, token, request_id, expires_at):
        del email, request_id, expires_at
        captured.append(token)
        return True

    monkeypatch.setattr(visitor_auth_module, "send_visitor_magic_link_email", fake_send)
    return captured


async def test_request_response_identical_regardless_of_match(client, monkeypatch):
    """Enumeration resistance: same response whether or not the email matches anything."""
    _capture_sent_token(monkeypatch)

    unmatched = await client.post("/api/visitor-sessions/request", json={"email": "nobody@example.com"})
    await _post_registration(client, email="somebody@example.com")
    matched = await client.post("/api/visitor-sessions/request", json={"email": "somebody@example.com"})

    assert unmatched.status_code == matched.status_code == 202
    assert unmatched.json() == matched.json()


async def test_request_is_rate_limited(client, monkeypatch):
    _capture_sent_token(monkeypatch)
    for _ in range(5):
        r = await client.post("/api/visitor-sessions/request", json={"email": "flood@example.com"})
        assert r.status_code == 202
    limited = await client.post("/api/visitor-sessions/request", json={"email": "flood@example.com"})
    assert limited.status_code == 429


async def test_redeem_establishes_session_and_claims_unowned_registration(client, db_session, monkeypatch):
    captured = _capture_sent_token(monkeypatch)
    reg = await _post_registration(client, email="visitor@example.com")
    assert reg.status_code == 201
    registration_id = reg.json()["id"]

    r = await client.post("/api/visitor-sessions/request", json={"email": "visitor@example.com"})
    assert r.status_code == 202
    token = captured[-1]

    redeemed = await client.post("/api/visitor-sessions/redeem", json={"token": token})
    assert redeemed.status_code == 200
    assert [item["id"] for item in redeemed.json()] == [registration_id]
    assert "visitor_session" in redeemed.cookies

    registration = await db_session.get(Registration, registration_id)
    user = await db_session.scalar(select(User).where(User.verified_email == "visitor@example.com"))
    assert user is not None
    await db_session.refresh(registration)
    assert registration.user_id == user.id
    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "registration_claimed",
            AuditEntry.resource_id == registration_id,
        )
    )
    assert audit is not None
    assert audit.actor == user.id
    assert audit.auth_source == "visitor_session"

    # The session persists: a later request with no token, cookie only, still
    # returns the same orders — the "check again in a week" scenario #953 exists for.
    later = await client.get("/api/me/registrations")
    assert later.status_code == 200
    assert [item["id"] for item in later.json()] == [registration_id]


async def test_redeem_is_single_use(client, monkeypatch):
    captured = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": "onceonly@example.com"})
    token = captured[-1]

    first = await client.post("/api/visitor-sessions/redeem", json={"token": token})
    assert first.status_code == 200

    replay = await client.post("/api/visitor-sessions/redeem", json={"token": token})
    assert replay.status_code == 401


async def test_redeem_rejects_expired_link(client, db_session, monkeypatch):
    captured = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": "expired@example.com"})
    token = captured[-1]

    link = await db_session.scalar(select(VisitorMagicLink).where(VisitorMagicLink.email == "expired@example.com"))
    link.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    r = await client.post("/api/visitor-sessions/redeem", json={"token": token})
    assert r.status_code == 401


async def test_redeem_rejects_unknown_token(client):
    r = await client.post("/api/visitor-sessions/redeem", json={"token": "x" * 32})
    assert r.status_code == 401


async def test_concurrent_redemption_only_one_succeeds(client, db_session, engine, monkeypatch):
    """Two concurrent redemptions of the same link: exactly one wins the row lock."""
    captured = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": "race@example.com"})
    token = captured[-1]

    import app.routers.visitor_auth as visitor_auth_module

    first_locked = asyncio.Event()
    release_first = asyncio.Event()
    original = visitor_auth_module._get_magic_link_or_401
    paused = False

    async def pause_first_lookup(db, tok):
        nonlocal paused
        link = await original(db, tok)
        if not paused:
            paused = True
            first_locked.set()
            await release_first.wait()
        return link

    monkeypatch.setattr(visitor_auth_module, "_get_magic_link_or_401", pause_first_lookup)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    from fastapi import HTTPException
    from starlette.responses import Response as StarletteResponse

    from app.schemas import RegistrationAccessLookupRequest

    async def attempt_redeem():
        async with session_factory() as session:
            try:
                return await visitor_auth_module.redeem_visitor_magic_link(
                    RegistrationAccessLookupRequest(token=token), StarletteResponse(), session
                )
            except HTTPException as exc:
                return exc.status_code

    first_task = asyncio.create_task(attempt_redeem())
    await asyncio.wait_for(first_locked.wait(), timeout=2)
    second_task = asyncio.create_task(attempt_redeem())
    await asyncio.sleep(0.05)
    release_first.set()
    outcomes = await asyncio.wait_for(asyncio.gather(first_task, second_task), timeout=2)

    assert sum(isinstance(outcome, list) for outcome in outcomes) == 1
    assert outcomes.count(401) == 1
    sessions = (await db_session.execute(select(VisitorSession))).scalars().all()
    assert len(sessions) == 1


async def test_redeem_does_not_reassign_owned_registration(client, db_session, monkeypatch):
    captured = _capture_sent_token(monkeypatch)
    reg = await _post_registration(client, email="ownedvisitor@example.com")
    registration_id = reg.json()["id"]
    existing_owner = User(id="usr-existing-owner-953", oidc_subject="staff-sub-953")
    registration = await db_session.get(Registration, registration_id)
    db_session.add(existing_owner)
    registration.user_id = existing_owner.id
    await db_session.commit()

    await client.post("/api/visitor-sessions/request", json={"email": "ownedvisitor@example.com"})
    token = captured[-1]

    # Same lookup-by-email shape as the pre-existing one-shot guest lookup
    # (registrations.access_my_registrations): still shown by proven email,
    # regardless of ownership — the protection is that redeeming never
    # *reassigns* Registration.user_id, checked below.
    redeemed = await client.post("/api/visitor-sessions/redeem", json={"token": token})
    assert redeemed.status_code == 200
    assert [item["id"] for item in redeemed.json()] == [registration_id]

    await db_session.refresh(registration)
    assert registration.user_id == existing_owner.id
    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "registration_claimed",
            AuditEntry.resource_id == registration_id,
        )
    )
    assert audit is None


async def test_visitor_session_cannot_access_admin_endpoints(client, db_session, monkeypatch):
    """Scope limit (#953 decision 3): a visitor session must never satisfy require_admin."""
    from app.auth import require_admin
    from app.main import app

    captured = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": "scopetest@example.com"})
    token = captured[-1]
    redeemed = await client.post("/api/visitor-sessions/redeem", json={"token": token})
    assert redeemed.status_code == 200

    # The `client` fixture stubs require_admin to always pass (dependency
    # override for admin-flow test convenience) — remove that override so the
    # request actually exercises whether the visitor-session cookie alone can
    # satisfy admin auth. It must not: require_admin only ever looks at the
    # Bearer scheme, never the cookie jar.
    app.dependency_overrides.pop(require_admin, None)
    try:
        r = await client.get("/api/people")
    finally:
        app.dependency_overrides[require_admin] = lambda: None
    assert r.status_code in (401, 403)


async def test_session_status_reports_signed_in_state(client, monkeypatch):
    anonymous = await client.get("/api/visitor-sessions/status")
    assert anonymous.json() == {"authenticated": False, "expires_at": None}

    captured = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": "status@example.com"})
    token = captured[-1]
    await client.post("/api/visitor-sessions/redeem", json={"token": token})

    signed_in = await client.get("/api/visitor-sessions/status")
    body = signed_in.json()
    assert body["authenticated"] is True
    assert body["expires_at"] is not None


async def test_sign_out_clears_session(client, db_session, monkeypatch):
    captured = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": "signout@example.com"})
    token = captured[-1]
    await client.post("/api/visitor-sessions/redeem", json={"token": token})

    sessions_before = (await db_session.execute(select(VisitorSession))).scalars().all()
    assert len(sessions_before) == 1

    r = await client.post("/api/visitor-sessions/sign-out")
    assert r.status_code == 204

    sessions_after = (await db_session.execute(select(VisitorSession))).scalars().all()
    assert sessions_after == []

    status_after = await client.get("/api/visitor-sessions/status")
    assert status_after.json()["authenticated"] is False


async def test_sign_out_without_a_session_is_a_noop(client):
    r = await client.post("/api/visitor-sessions/sign-out")
    assert r.status_code == 204


async def test_session_idle_window_slides_on_use(client, db_session, monkeypatch):
    captured = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": "sliding@example.com"})
    token = captured[-1]
    await client.post("/api/visitor-sessions/redeem", json={"token": token})

    row = await db_session.scalar(select(VisitorSession))
    original_expires_at = row.expires_at
    row.last_seen_at = datetime.now(UTC) - timedelta(days=2)
    row.expires_at = datetime.now(UTC) - timedelta(days=2) + SESSION_IDLE_TIMEOUT
    await db_session.commit()

    await client.get("/api/visitor-sessions/status")

    await db_session.refresh(row)
    assert row.expires_at > original_expires_at - timedelta(days=1)


async def test_session_rejected_past_idle_timeout(client, db_session, monkeypatch):
    captured = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": "idled-out@example.com"})
    token = captured[-1]
    await client.post("/api/visitor-sessions/redeem", json={"token": token})

    row = await db_session.scalar(select(VisitorSession))
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()

    r = await client.get("/api/visitor-sessions/status")
    assert r.json()["authenticated"] is False


async def test_session_rejected_past_hard_cap_even_if_recently_active(client, db_session, monkeypatch):
    """The hard cap must never be extended by activity, unlike the idle window."""
    captured = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": "hardcapped@example.com"})
    token = captured[-1]
    await client.post("/api/visitor-sessions/redeem", json={"token": token})

    row = await db_session.scalar(select(VisitorSession))
    row.last_seen_at = datetime.now(UTC)
    row.expires_at = datetime.now(UTC) + SESSION_IDLE_TIMEOUT
    row.hard_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()

    r = await client.get("/api/visitor-sessions/status")
    assert r.json()["authenticated"] is False


async def test_cleanup_expired_sessions_removes_only_stale_rows(db_session):
    now = datetime.now(UTC)
    db_session.add_all(
        [
            User(id="usr-cleanup-a", verified_email="cleanup-a@example.com"),
            User(id="usr-cleanup-b", verified_email="cleanup-b@example.com"),
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            VisitorSession(
                id="vse-stale",
                session_hash=hashlib.sha256(b"stale").hexdigest(),
                user_id="usr-cleanup-a",
                expires_at=now - timedelta(days=1),
                hard_expires_at=now + SESSION_HARD_CAP,
            ),
            VisitorSession(
                id="vse-fresh",
                session_hash=hashlib.sha256(b"fresh").hexdigest(),
                user_id="usr-cleanup-b",
                expires_at=now + SESSION_IDLE_TIMEOUT,
                hard_expires_at=now + SESSION_HARD_CAP,
            ),
        ]
    )
    await db_session.commit()

    deleted = await cleanup_expired_sessions(db_session)

    assert deleted == 1
    remaining = (await db_session.execute(select(VisitorSession.id))).scalars().all()
    assert remaining == ["vse-fresh"]


async def test_cleanup_expired_magic_links_removes_only_stale_rows(db_session):
    now = datetime.now(UTC)
    db_session.add_all(
        [
            VisitorMagicLink(
                id="vml-stale",
                email="stale-link@example.com",
                token_hash=hashlib.sha256(b"stale-link").hexdigest(),
                expires_at=now - timedelta(minutes=1),
            ),
            VisitorMagicLink(
                id="vml-fresh",
                email="fresh-link@example.com",
                token_hash=hashlib.sha256(b"fresh-link").hexdigest(),
                expires_at=now + timedelta(minutes=30),
            ),
        ]
    )
    await db_session.commit()

    deleted = await cleanup_expired_magic_links(db_session)

    assert deleted == 1
    remaining = (await db_session.execute(select(VisitorMagicLink.email))).scalars().all()
    assert remaining == ["fresh-link@example.com"]


async def test_user_requires_exactly_one_identity(db_session):
    db_session.add(User(id="usr-neither", oidc_subject=None, verified_email=None))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

    db_session.add(User(id="usr-both", oidc_subject="sub-x", verified_email="both@example.com"))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()
