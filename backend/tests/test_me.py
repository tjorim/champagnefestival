"""Integration tests for /api/me/* self-service endpoints."""

from __future__ import annotations

import pytest
from jose import jwt

ADMIN_HEADERS = {"Authorization": "Bearer admin-token"}


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
async def test_me_qr_returns_token(me_client):
    """GET /api/me/qr returns a signed JWT with an expiry."""
    r = await me_client.get("/api/me/qr")
    assert r.status_code == 200
    data = r.json()
    assert "token" in data
    assert "expires_at" in data


@pytest.mark.anyio
async def test_me_qr_token_contains_expected_claims(me_client):
    """The QR token payload contains the user's portal ID and oidc_sub."""
    r = await me_client.get("/api/me/qr")
    assert r.status_code == 200
    token = r.json()["token"]

    # Decode without verification to inspect claims (secret not available in test)
    claims = jwt.get_unverified_claims(token)
    assert claims["oidc_sub"] == "visitor-sub"
    assert "sub" in claims
    assert "exp" in claims
    assert "iat" in claims


@pytest.mark.anyio
async def test_me_qr_token_is_short_lived(me_client):
    """The QR token should expire within 20 minutes."""
    from datetime import UTC, datetime

    r = await me_client.get("/api/me/qr")
    token = r.json()["token"]
    claims = jwt.get_unverified_claims(token)

    now = datetime.now(UTC).timestamp()
    ttl_seconds = claims["exp"] - now
    assert 0 < ttl_seconds <= 20 * 60


@pytest.mark.anyio
async def test_me_qr_idempotent_user(me_client, db_session):
    """Calling /api/me/qr twice does not create duplicate User records."""
    from sqlalchemy import func, select

    from app.models import User

    await me_client.get("/api/me/qr")
    await me_client.get("/api/me/qr")

    count_result = await db_session.execute(select(func.count()).where(User.oidc_subject == "visitor-sub"))
    count = count_result.scalar_one()
    assert count == 1
