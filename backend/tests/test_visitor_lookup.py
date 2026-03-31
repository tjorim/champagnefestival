"""Tests for the visitor self-lookup (public token-based flow)."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

import app.ratelimit as ratelimit_module
from app.models import ReservationAccessToken
from tests.helpers import (
    _create_event,
    _post_registration,
    _registration_body,
)


@pytest.mark.anyio
async def test_request_my_reservations_access_is_generic(client, monkeypatch):
    sent_messages = []

    async def fake_send_guest_access_email(*, email, token, request_id, expires_at):
        sent_messages.append(
            {
                "email": email,
                "token": token,
                "request_id": request_id,
                "expires_at": expires_at,
            }
        )
        return True

    monkeypatch.setattr(
        "app.routers.registrations.send_guest_access_email",
        fake_send_guest_access_email,
    )

    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201

    found = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})
    missing = await client.post("/api/registrations/my/request", json={"email": "nobody@example.com"})

    assert found.status_code == 202
    assert missing.status_code == 202
    assert found.json()["delivery_mode"] == "email"
    assert missing.json()["delivery_mode"] == "email"
    assert found.json()["expires_in_minutes"] == missing.json()["expires_in_minutes"]
    assert "access_token" not in found.json()
    assert "access_token" not in missing.json()
    assert "access_url" not in found.json()
    assert "access_url" not in missing.json()
    assert len(sent_messages) == 2
    assert sent_messages[0]["email"] == "jean@example.com"
    assert sent_messages[1]["email"] == "nobody@example.com"
    assert sent_messages[0]["token"]
    assert sent_messages[0]["request_id"]


@pytest.mark.anyio
async def test_request_my_reservations_access_mail_failure_is_non_blocking(client, monkeypatch):
    async def failing_send_guest_access_email(*, email, token, request_id, expires_at):
        raise RuntimeError("smtp unavailable")

    monkeypatch.setattr(
        "app.routers.registrations.send_guest_access_email",
        failing_send_guest_access_email,
    )

    response = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})

    assert response.status_code == 202


@pytest.mark.anyio
async def test_my_reservations_case_insensitive_email(client):
    """Email stored with mixed case must be retrievable via lowercase lookup."""
    r = await _post_registration(client, path="/api/registrations", email="Jean@Example.com")
    assert r.status_code == 201

    r = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 202


@pytest.mark.anyio
async def test_my_reservations_access_token_flow(client, db_session, monkeypatch):
    """Guest reservations are only returned after presenting a valid token."""
    token = "guest-access-token-12345"
    monkeypatch.setattr("app.routers.registrations.secrets.token_urlsafe", lambda _: token)

    r = await _post_registration(client, path="/api/registrations", email="Jean@Example.com")
    assert r.status_code == 201

    r = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 202

    token_rows = (await db_session.execute(select(ReservationAccessToken))).scalars().all()
    assert len(token_rows) == 1
    assert token_rows[0].email == "jean@example.com"
    assert token_rows[0].token_hash != token
    assert token_rows[0].token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()

    r = await client.post("/api/registrations/my/access", json={"token": token})
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert "check_in_token" not in items[0]
    assert "phone" not in items[0]
    assert "notes" not in items[0]
    assert items[0]["status"] == "pending"
    assert items[0]["event_title"] == "Vrijdagavond"
    # Token is expired immediately after first use to prevent replay.
    await db_session.refresh(token_rows[0])
    expires_at = token_rows[0].expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    assert expires_at <= datetime.now(UTC)


@pytest.mark.anyio
async def test_my_reservations_access_requires_valid_token(client):
    r = await client.post(
        "/api/registrations/my/access",
        json={"token": "invalid-token-value-12345"},
    )
    assert r.status_code == 401


@pytest.mark.anyio
async def test_my_reservations_request_invalid_email(client):
    r = await client.post("/api/registrations/my/request", json={"email": "not-an-email"})
    assert r.status_code == 422


@pytest.mark.anyio
async def test_my_reservations_access_expired_token(client, db_session):
    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201

    db_session.add(
        ReservationAccessToken(
            id="rat_expired",
            email="jean@example.com",
            token_hash=hashlib.sha256(b"expired-token-value-12345").hexdigest(),
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
    )
    await db_session.commit()

    r = await client.post(
        "/api/registrations/my/access",
        json={"token": "expired-token-value-12345"},
    )
    assert r.status_code == 401


@pytest.mark.anyio
async def test_my_reservations_access_multiple_editions(client, monkeypatch):
    # Each registration gets a unique check_in_token; the last call issues the
    # guest access token (the value we will present to /my/access).
    guest_token = "guest-access-token-12345"
    token_seq = iter(["check-in-tok-fri", "check-in-tok-sat", guest_token])
    monkeypatch.setattr("app.routers.registrations.secrets.token_urlsafe", lambda _: next(token_seq))

    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201
    saturday_event = await _create_event(
        client,
        edition_id="edition-my-reservations-sat",
        title="Zaterdagavond",
        date="2099-03-22",
    )
    r = await client.post(
        "/api/registrations",
        json=_registration_body(saturday_event, event_title="Zaterdagavond"),
    )
    assert r.status_code == 201

    r = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 202

    r = await client.post("/api/registrations/my/access", json={"token": guest_token})
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.anyio
async def test_my_reservations_request_reuses_existing_token_row(client, db_session, monkeypatch):
    tokens = iter(["guest-access-token-12345", "guest-access-token-67890"])
    monkeypatch.setattr(
        "app.routers.registrations.secrets.token_urlsafe",
        lambda _: next(tokens),
    )

    first = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})
    second = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})

    assert first.status_code == 202
    assert second.status_code == 202

    token_rows = (await db_session.execute(select(ReservationAccessToken))).scalars().all()
    assert len(token_rows) == 1
    assert token_rows[0].email == "jean@example.com"
    assert token_rows[0].token_hash == hashlib.sha256(b"guest-access-token-67890").hexdigest()


@pytest.mark.anyio
async def test_my_reservations_request_recovers_from_insert_race(client, db_session, monkeypatch):
    tokens = iter(["guest-access-token-first", "guest-access-token-second"])
    monkeypatch.setattr(
        "app.routers.registrations.secrets.token_urlsafe",
        lambda _: next(tokens),
    )

    original_commit = db_session.commit
    factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    race_inserted = False

    async def flaky_commit():
        nonlocal race_inserted
        if race_inserted:
            await original_commit()
            return

        async with factory() as other_session:
            other_session.add(
                ReservationAccessToken(
                    id="rat-race",
                    email="jean@example.com",
                    token_hash=hashlib.sha256(b"guest-access-token-first").hexdigest(),
                    expires_at=datetime.now(UTC) + timedelta(minutes=5),
                )
            )
            await other_session.commit()

        race_inserted = True
        raise IntegrityError("INSERT", {}, Exception("duplicate key value violates unique constraint"))

    monkeypatch.setattr(db_session, "commit", flaky_commit)

    response = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})

    assert response.status_code == 202
    token_rows = (await db_session.execute(select(ReservationAccessToken))).scalars().all()
    assert len(token_rows) == 1
    assert token_rows[0].email == "jean@example.com"
    assert token_rows[0].token_hash == hashlib.sha256(b"guest-access-token-first").hexdigest()


@pytest.mark.anyio
async def test_my_reservations_access_token_single_use(client, monkeypatch):
    """A guest access token is invalidated after first use (single-use)."""
    guest_token = "guest-access-token-12345"
    token_seq = iter(["check-in-tok-001", guest_token])
    monkeypatch.setattr("app.routers.registrations.secrets.token_urlsafe", lambda _: next(token_seq))

    r = await _post_registration(client, path="/api/registrations")
    assert r.status_code == 201

    r = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 202

    first = await client.post("/api/registrations/my/access", json={"token": guest_token})
    second = await client.post("/api/registrations/my/access", json={"token": guest_token})

    assert first.status_code == 200
    assert len(first.json()) == 1
    # Token is expired after first use; second attempt must be rejected.
    assert second.status_code == 401


@pytest.mark.anyio
async def test_my_reservations_request_rate_limited(client):
    """After exceeding the per-IP request limit the endpoint returns 429."""
    limit = ratelimit_module._RATE_LIMIT_MAX_REQUESTS
    for _ in range(limit):
        r = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})
        assert r.status_code == 202

    r = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 429
