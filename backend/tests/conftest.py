"""Shared pytest fixtures for backend integration tests."""

from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.ratelimit as ratelimit_module
from app.database import Base, get_db
from app.main import app
from tests.helpers import ADMIN_TOKEN

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    # Default targets a *separate* test database (test_champagne) so the dev
    # database (champagne, provisioned by docker-compose) is never touched.
    # Create it once with: psql -U postgres -c "CREATE DATABASE test_champagne;"
    # Override via TEST_DATABASE_URL env var in CI or custom environments.
    "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne",
)


@pytest.fixture(autouse=True)
def set_admin_token(monkeypatch):
    monkeypatch.setattr("app.config.settings.admin_token", ADMIN_TOKEN)


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
    import re

    # Extract host and database name from the DSN.
    # Handles both:  scheme://user:pass@host:port/dbname
    #                scheme://host/dbname
    match = re.search(r"@([^/:]+)[:/].*?/([^?#]+)", url)
    if match:
        host, dbname = match.group(1), match.group(2)
    else:
        # Fallback: no userinfo — scheme://host/dbname
        match2 = re.search(r"://([^/:]+)[:/].*?/([^?#]+)", url)
        host = match2.group(1) if match2 else ""
        dbname = match2.group(2) if match2 else url

    is_local = host in ("localhost", "127.0.0.1", "::1")
    is_test_db = "test" in dbname.lower()
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
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
