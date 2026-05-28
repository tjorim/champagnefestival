"""Tests for X-Request-ID correlation middleware."""

from __future__ import annotations

import pytest


@pytest.mark.anyio
async def test_response_includes_request_id_header(client):
    r = await client.get("/api/health/liveness")
    assert r.status_code == 200
    assert "x-request-id" in r.headers


@pytest.mark.anyio
async def test_generated_request_id_is_uuid_format(client):
    r = await client.get("/api/health/liveness")
    request_id = r.headers["x-request-id"]
    # UUID4: 8-4-4-4-12 hex chars separated by hyphens
    parts = request_id.split("-")
    assert len(parts) == 5
    assert len(parts[0]) == 8
    assert len(parts[1]) == 4
    assert len(parts[2]) == 4
    assert len(parts[3]) == 4
    assert len(parts[4]) == 12


@pytest.mark.anyio
async def test_incoming_request_id_is_echoed(client):
    custom_id = "my-custom-request-id-abc"
    r = await client.get("/api/health/liveness", headers={"X-Request-ID": custom_id})
    assert r.headers["x-request-id"] == custom_id


@pytest.mark.anyio
async def test_different_requests_get_different_ids(client):
    r1 = await client.get("/api/health/liveness")
    r2 = await client.get("/api/health/liveness")
    assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


@pytest.mark.anyio
async def test_request_id_present_on_error_response(client):
    r = await client.get("/api/nonexistent-endpoint-404")
    # Even 404s should carry the correlation header
    assert "x-request-id" in r.headers


@pytest.mark.anyio
async def test_metrics_response_includes_request_id(client, monkeypatch):
    monkeypatch.setattr("app.routers.health.settings", type("S", (), {"metrics_secret": "secret"})())
    r = await client.get("/api/metrics", headers={"X-Metrics-Secret": "secret"})
    assert r.status_code == 200
    assert "x-request-id" in r.headers
