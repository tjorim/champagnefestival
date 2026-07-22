"""Tests for the general per-IP rate limiter and Host header validation middleware."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.middleware import add_rate_limit_middleware, add_trusted_host_middleware


def _ping_app() -> FastAPI:
    app = FastAPI()

    @app.get("/api/ping")
    async def ping() -> dict[str, str]:
        return {"status": "ok"}

    return app


@pytest.mark.anyio
async def test_general_rate_limit_allows_requests_within_default():
    app = _ping_app()
    add_rate_limit_middleware(app, Settings(rate_limit_default="2/minute"))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.get("/api/ping")
        second = await client.get("/api/ping")

    assert first.status_code == 200
    assert second.status_code == 200


@pytest.mark.anyio
async def test_general_rate_limit_returns_429_once_exceeded():
    app = _ping_app()
    add_rate_limit_middleware(app, Settings(rate_limit_default="2/minute"))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/api/ping")
        await client.get("/api/ping")
        third = await client.get("/api/ping")

    assert third.status_code == 429


@pytest.mark.anyio
async def test_general_rate_limit_disabled_allows_unlimited_requests():
    app = _ping_app()
    add_rate_limit_middleware(app, Settings(rate_limit_default="1/minute", rate_limit_enabled=False))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for _ in range(5):
            r = await client.get("/api/ping")
            assert r.status_code == 200


@pytest.mark.anyio
async def test_trusted_host_middleware_rejects_unknown_host():
    app = _ping_app()
    add_trusted_host_middleware(app, Settings(trusted_hosts="allowed.example.test"))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://not-allowed.example.test") as client:
        r = await client.get("/api/ping")

    assert r.status_code == 400


@pytest.mark.anyio
async def test_trusted_host_middleware_allows_configured_host():
    app = _ping_app()
    add_trusted_host_middleware(app, Settings(trusted_hosts="allowed.example.test"))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://allowed.example.test") as client:
        r = await client.get("/api/ping")

    assert r.status_code == 200


@pytest.mark.anyio
async def test_trusted_host_middleware_noop_when_unconfigured():
    app = _ping_app()
    add_trusted_host_middleware(app, Settings(trusted_hosts=""))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://anything.example.test") as client:
        r = await client.get("/api/ping")

    assert r.status_code == 200
