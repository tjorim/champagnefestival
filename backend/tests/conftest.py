"""Shared pytest fixtures for backend integration tests."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.ratelimit as ratelimit_module
from app.database import Base, get_db
from app.main import app
from tests.helpers import ADMIN_TOKEN

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(autouse=True)
def set_admin_token(monkeypatch):
    monkeypatch.setattr("app.config.settings.admin_token", ADMIN_TOKEN)
    monkeypatch.setattr("app.auth.settings.admin_token", ADMIN_TOKEN)


@pytest.fixture(autouse=True)
def reset_rate_limiter(monkeypatch):
    """Reset the in-memory rate limiter before every test for isolation."""
    monkeypatch.setattr(ratelimit_module, "_rate_limit_buckets", {})


@pytest.fixture()
async def db_session():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture()
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
