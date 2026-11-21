"""Privacy and security headers of the API: what it sets itself, and what it deliberately leaves to the edge.

The API has no blanket header layer: transport headers such as HSTS and a content security policy belong to the reverse
proxy in front of it, like in the other apps. What it does set are the caching and sniffing headers of responses that
depend on who asks or carry a credential, and the CORS contract the browser client relies on. These tests pin both, so
a change is a decision.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from limits import parse

from app.core.config import Settings
from app.main import app, general_rate_limiter
from app.middleware.setup import add_cors_middleware

ALLOWED_ORIGIN = "https://admin.example.test"


def _cors_client() -> AsyncClient:
    """The assembled app reads its CORS origins from the environment at import time; the same configuration function
    on a small app pins the contract with a known origin."""
    cors_app = FastAPI()

    @cors_app.get("/api/ping")
    async def ping() -> dict[str, str]:
        return {"status": "ok"}

    add_cors_middleware(cors_app, Settings(cors_origins=ALLOWED_ORIGIN))
    return AsyncClient(transport=ASGITransport(app=cors_app), base_url="http://test")


@pytest.mark.anyio
async def test_public_reads_say_how_long_they_may_be_cached(client):
    settings = await client.get("/api/settings")
    server_time = await client.get("/api/signage/time")

    assert settings.status_code == 200
    assert settings.headers["cache-control"] == "public, max-age=30"
    assert server_time.status_code == 200
    # The signage clock must never come from a cache.
    assert server_time.headers["cache-control"] == "no-store"


@pytest.mark.anyio
async def test_admin_and_account_responses_are_not_stored(client):
    response = await client.get("/api/events/translation")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.anyio
async def test_csv_exports_are_attachments(client):
    response = await client.get("/api/people/export")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == 'attachment; filename="people.csv"'


@pytest.mark.anyio
async def test_an_unknown_signage_image_is_a_json_404_that_is_not_cacheable_as_an_image(client):
    response = await client.get("/uploads/signage/" + "a" * 32 + ".jpg")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert "immutable" not in response.headers.get("cache-control", "")


@pytest.mark.anyio
async def test_the_rate_limit_response_is_not_stored(client, monkeypatch):
    monkeypatch.setattr(general_rate_limiter, "limit", parse("1/minute"))
    transport = ASGITransport(app=app, client=("203.0.113.30", 1234))
    async with AsyncClient(transport=transport, base_url="http://test") as limited:
        await limited.get("/api/settings")
        response = await limited.get("/api/settings")

    assert response.status_code == 429
    assert response.headers["cache-control"] == "no-store"
    assert "retry-after" in response.headers


@pytest.mark.anyio
async def test_request_id_and_timing_headers_are_on_every_kind_of_response(client):
    responses = (
        await client.get("/api/health"),  # 200
        await client.get("/api/does-not-exist"),  # 404 from the framework
        await client.get("/uploads/signage/not-a-valid-name"),  # 404 from a route
        await client.post("/api/events", json={}),  # 422
        await client.delete("/api/health"),  # 405
    )
    for response in responses:
        assert response.headers["x-request-id"]
        assert "server-timing" in response.headers


@pytest.mark.anyio
async def test_cors_allows_only_the_configured_origins():
    async with _cors_client() as client:
        allowed = await client.options(
            "/api/ping",
            headers={
                "Origin": ALLOWED_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization, X-Request-ID",
            },
        )
        assert allowed.status_code == 200
        assert allowed.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
        assert allowed.headers["access-control-allow-credentials"] == "true"
        assert "x-request-id" in allowed.headers["access-control-allow-headers"].lower()

        denied = await client.options(
            "/api/ping", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"}
        )
        assert denied.status_code == 400
        assert "access-control-allow-origin" not in denied.headers

        simple = await client.get("/api/ping", headers={"Origin": "https://evil.example"})
        assert "access-control-allow-origin" not in simple.headers


@pytest.mark.anyio
async def test_cors_exposes_the_headers_the_client_reads():
    async with _cors_client() as client:
        response = await client.get("/api/ping", headers={"Origin": ALLOWED_ORIGIN})

    exposed = {name.strip().lower() for name in response.headers["access-control-expose-headers"].split(",")}
    assert {"x-request-id", "retry-after", "x-ratelimit-remaining"} <= exposed


@pytest.mark.anyio
async def test_the_api_leaves_transport_headers_to_the_edge(client):
    # HSTS, CSP and frame options are set by the reverse proxy in front of the API; setting them twice would let the
    # two layers disagree. A change here is a decision to move that responsibility.
    response = await client.get("/api/health")

    for name in ("strict-transport-security", "content-security-policy", "x-frame-options"):
        assert name not in response.headers
