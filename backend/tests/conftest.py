"""Shared pytest fixtures for backend integration tests."""

from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.ratelimit as ratelimit_module
from app.auth import get_current_claims, require_admin, require_volunteer
from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    # Default targets a *separate* test database (test_champagne) so the dev
    # database (champagne, provisioned by docker-compose) is never touched.
    # Create it once with:
    #   psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE test_champagne;"
    # Override via TEST_DATABASE_URL env var in CI or custom environments.
    "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne",
)

# Fake claims injected by the `volunteer_client` and `me_client` fixtures.
VOLUNTEER_CLAIMS = {"sub": "vol-sub", "realm_access": {"roles": ["volunteer"]}}
VISITOR_CLAIMS = {"sub": "visitor-sub", "realm_access": {"roles": ["visitor"]}}
ADMIN_HEADERS = {"Authorization": "Bearer admin-token"}


@pytest.fixture(autouse=True)
def reset_rate_limiter(monkeypatch):
    """Reset the in-memory rate limiter before every test for isolation."""
    monkeypatch.setattr(ratelimit_module, "_rate_limit_buckets", {})


def _assert_test_database_url(url: str) -> None:
    """Raise RuntimeError if *url* does not look like a safe test database.

    We require the database name to contain the word "test" OR the host to be
    localhost/127.0.0.1 — as a last-resort guard against accidentally running
    drop_all() against a production database.
    """
    from sqlalchemy.engine.url import make_url

    parsed = make_url(url)
    host = (parsed.host or "").lower()
    dbname = (parsed.database or "").lower()

    is_local = host in ("localhost", "127.0.0.1", "::1")
    is_test_db = "test" in dbname
    if not (is_local or is_test_db):
        raise RuntimeError(
            f"TEST_DATABASE_URL ({url!r}) does not appear to be a safe test database. "
            "The host must be localhost or the database name must contain 'test'. "
            "Refusing to run drop_all() to protect production data."
        )


@pytest.fixture(scope="session")
async def engine():
    """Session-scoped engine: create schema once, drop after all tests."""
    _assert_test_database_url(TEST_DATABASE_URL)
    _engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest.fixture()
async def db_session(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest.fixture()
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[require_volunteer] = lambda: None
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
async def unauth_client(db_session):
    """Client that simulates unauthenticated requests.

    ``require_admin`` is overridden with a function that always raises 401,
    mimicking what SuperTokens ``verify_session`` does for unauthenticated
    callers.  Use this fixture in tests that verify endpoints reject
    unauthenticated access.
    """
    from fastapi import HTTPException

    async def override_get_db():
        yield db_session

    def reject() -> None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_admin] = reject
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
async def forbidden_client(db_session):
    """Client that simulates a session without the admin role.

    ``require_admin`` is overridden with a function that always raises 403,
    mimicking what SuperTokens ``verify_session`` does when the session exists
    but lacks the ``admin`` role (``UserRoleClaim`` check fails).  Use this
    fixture in tests that verify endpoints reject non-admin sessions.
    """
    from fastapi import HTTPException

    async def override_get_db():
        yield db_session

    def reject() -> None:
        raise HTTPException(status_code=403, detail="Forbidden")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_admin] = reject
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
async def volunteer_client(db_session):
    """Client that simulates a volunteer (has the ``volunteer`` role).

    Both ``require_volunteer`` and ``require_admin`` are overridden so that
    volunteer-accessible endpoints pass while admin-only endpoints still raise 403.
    """
    from fastapi import HTTPException

    async def override_get_db():
        yield db_session

    def reject_admin() -> None:
        raise HTTPException(status_code=403, detail="Forbidden")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_volunteer] = lambda: None
    app.dependency_overrides[require_admin] = reject_admin
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
async def me_client(db_session):
    """Client that simulates an authenticated visitor for ``/api/me/*`` endpoints.

    ``get_current_claims`` is overridden to return a fixed set of claims so that
    tests can exercise the self-service endpoints without a real OIDC provider.
    """
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_claims] = lambda: VISITOR_CLAIMS
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
