"""Tests for the request ID middleware: the ``X-Request-ID`` header, the JSON access line and the request metrics."""

from __future__ import annotations

import json
import logging
import re

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.core.auth import AuthType
from app.core.logging import ACCESS_LOGGER
from app.core.observability import metrics
from app.middleware.request_id import RequestIdMiddleware, current_request_id
from app.routers.health import build_metrics_token

_UUID4_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def _access_lines(caplog) -> list[dict]:
    return [json.loads(rec.getMessage()) for rec in caplog.records if rec.name == ACCESS_LOGGER]


@pytest.mark.anyio
async def test_response_includes_request_id_header(client):
    r = await client.get("/api/health/liveness")
    assert r.status_code == 200
    assert "x-request-id" in r.headers


@pytest.mark.anyio
async def test_generated_request_id_is_uuid4(client):
    r = await client.get("/api/health/liveness")
    assert _UUID4_RE.match(r.headers["x-request-id"])


@pytest.mark.anyio
@pytest.mark.parametrize("supplied", ["my-gateway-req-id-001", "a.b_c:d-1", "x" * 128])
async def test_supplied_token_is_echoed(client, supplied):
    r = await client.get("/api/health/liveness", headers={"X-Request-ID": supplied})
    assert r.headers["x-request-id"] == supplied


@pytest.mark.anyio
@pytest.mark.parametrize("supplied", ["x" * 129, "has space", "a/b", "a;b", "a=b", '{"event":"forged"}'])
async def test_unsafe_supplied_id_is_replaced(client, supplied):
    # A caller must not be able to put arbitrary text into the log lines.
    r = await client.get("/api/health/liveness", headers={"X-Request-ID": supplied})
    assert _UUID4_RE.match(r.headers["x-request-id"])


@pytest.mark.anyio
async def test_different_requests_get_different_ids(client):
    r1 = await client.get("/api/health/liveness")
    r2 = await client.get("/api/health/liveness")
    assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


@pytest.mark.anyio
async def test_request_id_present_on_error_response(client):
    r = await client.get("/api/nonexistent-endpoint-404")
    # Even 404s should carry the correlation header
    assert r.status_code == 404
    assert "x-request-id" in r.headers


@pytest.mark.anyio
async def test_metrics_response_includes_request_id(client, monkeypatch):
    monkeypatch.setattr("app.routers.health.settings", type("S", (), {"metrics_hmac_secret": "secret"})())
    r = await client.get("/api/metrics", headers={"X-Metrics-Token": build_metrics_token("secret")})
    assert r.status_code == 200
    assert "x-request-id" in r.headers


@pytest.mark.anyio
async def test_access_line_is_json_with_the_shared_field_names(client, caplog):
    with caplog.at_level(logging.INFO, logger=ACCESS_LOGGER):
        r = await client.get("/api/health/liveness", headers={"X-Request-ID": "trace-1"})

    assert r.status_code == 200
    lines = _access_lines(caplog)
    assert lines, "Expected one access line from the request id middleware"
    assert lines[-1] == {
        "event": "http_request",
        "request_id": "trace-1",
        "user_id": None,
        "auth_type": None,
        "method": "GET",
        "route": "/api/health/liveness",
        "status_code": 200,
        "latency_ms": lines[-1]["latency_ms"],
    }
    assert lines[-1]["latency_ms"] >= 0


@pytest.mark.anyio
async def test_access_line_logs_the_route_template_not_the_raw_path_or_query(client, caplog):
    with caplog.at_level(logging.INFO, logger=ACCESS_LOGGER):
        await client.get("/api/events/123456?token=secret-token")

    text = "\n".join(rec.getMessage() for rec in caplog.records if rec.name == ACCESS_LOGGER)
    assert "secret-token" not in text
    assert "123456" not in text
    assert _access_lines(caplog)[-1]["route"] == "/api/events/{event_id}"


@pytest.mark.anyio
async def test_access_line_level_follows_the_status(client, caplog):
    with caplog.at_level(logging.INFO, logger=ACCESS_LOGGER):
        await client.get("/api/health/liveness")
        await client.get("/api/nonexistent-endpoint-404")

    levels = [rec.levelno for rec in caplog.records if rec.name == ACCESS_LOGGER]
    assert levels == [logging.INFO, logging.WARNING]
    assert _access_lines(caplog)[-1]["route"] == "unmatched"


def _app_with(route_handler) -> FastAPI:
    application = FastAPI()
    application.add_middleware(RequestIdMiddleware)
    application.get("/boom")(route_handler)
    return application


@pytest.mark.anyio
async def test_an_unhandled_exception_is_a_json_500_with_the_request_id_and_is_logged(caplog):
    async def boom():
        raise RuntimeError("secret internals")

    before = metrics.snapshot().total_errors
    transport = ASGITransport(app=_app_with(boom), raise_app_exceptions=False)
    with caplog.at_level(logging.INFO):
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            r = await c.get("/boom", headers={"X-Request-ID": "trace-500"})

    assert r.status_code == 500
    assert r.headers["content-type"] == "application/json"
    assert r.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert r.headers["x-request-id"] == "trace-500"
    assert "secret internals" not in r.text
    line = _access_lines(caplog)[-1]
    assert (line["status_code"], line["request_id"], line["route"]) == (500, "trace-500", "/boom")
    assert [rec.levelno for rec in caplog.records if rec.name == ACCESS_LOGGER] == [logging.ERROR]
    assert metrics.snapshot().total_errors == before + 1


@pytest.mark.anyio
async def test_the_request_id_is_available_to_handlers_and_reset_afterwards():
    seen: dict[str, str | None] = {}

    async def handler(request: Request):
        seen["state"] = request.state.request_id
        seen["context"] = current_request_id.get()
        return {}

    async with AsyncClient(transport=ASGITransport(app=_app_with(handler)), base_url="http://test") as c:
        r = await c.get("/boom", headers={"X-Request-ID": "trace-ctx"})

    assert r.status_code == 200
    assert seen == {"state": "trace-ctx", "context": "trace-ctx"}
    assert current_request_id.get() is None


@pytest.mark.anyio
async def test_the_access_line_names_the_authenticated_principal(caplog):
    async def handler(request: Request):
        request.state.user_id = "subject-1"
        request.state.auth_type = AuthType.KEYCLOAK_USER
        return {}

    with caplog.at_level(logging.INFO, logger=ACCESS_LOGGER):
        async with AsyncClient(transport=ASGITransport(app=_app_with(handler)), base_url="http://test") as c:
            await c.get("/boom")

    line = _access_lines(caplog)[-1]
    assert (line["user_id"], line["auth_type"]) == ("subject-1", "keycloak_user")


@pytest.mark.anyio
async def test_requests_are_recorded_in_the_metrics(client):
    before = metrics.snapshot().total_requests
    await client.get("/api/health/liveness")
    assert metrics.snapshot().total_requests == before + 1
