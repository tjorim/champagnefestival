"""Shared pytest fixtures for backend integration tests."""

from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.ratelimit as ratelimit_module
from app.database import Base, get_db
from app.main import app
from tests.helpers import ADMIN_TOKEN

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    # Default matches the local docker-compose.yml postgres service.
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


@pytest.fixture(scope="session")
async def engine():
    """Session-scoped engine: create schema once, drop after all tests."""
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
