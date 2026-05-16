"""Integration tests for /api/me/* self-service endpoints."""

from __future__ import annotations

from typing import cast

import pytest
import jwt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.routers import me

ADMIN_HEADERS = {"Authorization": "Bearer admin-token"}


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _RacingUserSession:
    def __init__(self, existing_user: User):
        self.results = [None, existing_user]
        self.added_user: User | None = None
        self.rolled_back = False
        self.refreshed_user: User | None = None

    async def execute(self, _statement):
        return _ScalarResult(self.results.pop(0))

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
    monkeypatch.setattr(me, "make_id", lambda _prefix: "usr-new")

    user = await me._get_or_create_user(cast(AsyncSession, session), "visitor-sub")

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
    claims = jwt.decode(token, options={"verify_signature": False}, algorithms=["HS256"])
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
    claims = jwt.decode(token, options={"verify_signature": False}, algorithms=["HS256"])

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
