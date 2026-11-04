"""Tests for the general per-IP rate limiter and Host header validation middleware."""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from limits import parse

from app.config import Settings
from app.main import general_rate_limit_exceeded
from app.middleware import GeneralRateLimiter, GeneralRateLimitExceeded, add_trusted_host_middleware


def _ping_app(settings: Settings | None = None) -> FastAPI:
    limiter = GeneralRateLimiter(settings or Settings())
    app = FastAPI(dependencies=[Depends(limiter)])
    app.exception_handler(GeneralRateLimitExceeded)(general_rate_limit_exceeded)

    @app.get("/api/ping")
    async def ping() -> dict[str, str]:
        return {"status": "ok"}

    return app


@pytest.mark.anyio
async def test_general_rate_limit_allows_requests_within_default():
    app = _ping_app(Settings(rate_limit_default="2/minute"))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.get("/api/ping")
        second = await client.get("/api/ping")

    assert first.status_code == 200
    assert second.status_code == 200


@pytest.mark.anyio
async def test_general_rate_limit_returns_429_once_exceeded():
    app = _ping_app(Settings(rate_limit_default="2/minute"))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/api/ping")
        await client.get("/api/ping")
        third = await client.get("/api/ping")

    assert third.status_code == 429


@pytest.mark.anyio
async def test_general_rate_limit_disabled_allows_unlimited_requests():
    app = _ping_app(Settings(rate_limit_default="1/minute", rate_limit_enabled=False))

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


@pytest.mark.anyio
async def test_every_openapi_operation_enforces_general_limit(monkeypatch):
    """Exercise real routing without executing writes: exhaust each bucket first."""
    import re

    from app.main import app, general_rate_limiter

    monkeypatch.setattr(general_rate_limiter, "limit", parse("1/minute"))
    monkeypatch.setattr(general_rate_limiter, "enabled", True)
    exempt = {"/api/check-in/{reservation_id}", "/api/check-in/{reservation_id}/lookup"}
    transport = ASGITransport(app=app, client=("203.0.113.10", 1234))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for template, operations in app.openapi()["paths"].items():
            general_rate_limiter.reset()
            assert general_rate_limiter.limiter.hit(general_rate_limiter.limit, "203.0.113.10", template)
            path = re.sub(r"\{[^}]+\}", "1", template)
            for method in operations:
                if method not in {"get", "post", "put", "patch", "delete", "head", "options"}:
                    continue
                response = await client.request(method, path)
                if template in exempt:
                    # Missing token body must reach validation, despite the full bucket.
                    assert response.status_code == 422, (method, template, response.text)
                    continue
                assert response.status_code == 429, (method, template, response.text)
                assert response.json() == {"error": "Rate limit exceeded: 1 per 1 minute"}


@pytest.mark.anyio
async def test_included_nested_router_shares_template_bucket_and_exempts_endpoint():
    from fastapi import APIRouter
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route

    async def exempt():
        return {"ok": True}

    limiter = GeneralRateLimiter(Settings(rate_limit_default="1/minute"), exempt_routes=(exempt,))
    app = FastAPI(dependencies=[Depends(limiter)])
    app.exception_handler(GeneralRateLimitExceeded)(general_rate_limit_exceeded)
    router = APIRouter()

    @router.get("/items/{item_id}")
    async def item(item_id: str):
        return {"id": item_id}

    router.add_api_route("/exempt", exempt)
    parent = APIRouter()
    parent.include_router(router)
    app.include_router(parent)
    app.mount("/mcp", Starlette(routes=[Route("/", lambda request: PlainTextResponse("ok"))]))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/items/a")).status_code == 200
        assert (await client.get("/items/b")).status_code == 429
        for _ in range(3):
            assert (await client.get("/exempt")).status_code == 200
            assert (await client.get("/mcp/")).status_code == 200
