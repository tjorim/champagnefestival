"""Tests for the health check endpoints, metrics endpoint, and application settings validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES, Settings
from app.observability import InMemoryRequestMetrics


# ---------------------------------------------------------------------------
# Health endpoints
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_liveness(client):
    r = await client.get("/api/health/liveness")
    assert r.status_code == 200
    assert r.json() == {"status": "alive"}


@pytest.mark.anyio
async def test_readiness(client):
    r = await client.get("/api/health/readiness")
    assert r.status_code == 200
    assert r.json() == {"status": "ready"}


@pytest.mark.anyio
async def test_health_summary(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "liveness_endpoint" in body
    assert "readiness_endpoint" in body


# ---------------------------------------------------------------------------
# Metrics endpoint
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_metrics_forbidden_without_secret(client):
    r = await client.get("/api/metrics")
    assert r.status_code == 403


@pytest.mark.anyio
async def test_metrics_forbidden_wrong_secret(client, monkeypatch):
    monkeypatch.setattr("app.routers.health.settings", type("S", (), {"metrics_secret": "correct"})())
    r = await client.get("/api/metrics", headers={"X-Metrics-Secret": "wrong"})
    assert r.status_code == 403


@pytest.mark.anyio
async def test_metrics_ok_with_secret(client, monkeypatch):
    monkeypatch.setattr("app.routers.health.settings", type("S", (), {"metrics_secret": "mysecret"})())
    r = await client.get("/api/metrics", headers={"X-Metrics-Secret": "mysecret"})
    assert r.status_code == 200
    body = r.json()
    assert "uptime_seconds" in body
    assert "request_total" in body
    assert "error_total" in body
    assert "request_rate_per_second" in body
    assert "error_rate" in body
    assert "latency_avg_ms" in body
    assert "latency_p50_ms" in body
    assert "latency_p99_ms" in body


# ---------------------------------------------------------------------------
# InMemoryRequestMetrics unit tests
# ---------------------------------------------------------------------------


def test_metrics_initial_snapshot():
    m = InMemoryRequestMetrics()
    snap = m.snapshot()
    assert snap.total_requests == 0
    assert snap.total_errors == 0
    assert snap.error_rate == 0.0
    assert snap.latency_avg_ms == 0.0
    assert snap.latency_p50_ms == 0.0
    assert snap.latency_p99_ms == 0.0
    assert snap.uptime_seconds > 0
    assert snap.request_rate_per_second >= 0.0


def test_metrics_records_requests():
    m = InMemoryRequestMetrics()
    m.record(status_code=200, latency_ms=10.0)
    m.record(status_code=200, latency_ms=20.0)
    m.record(status_code=500, latency_ms=5.0)
    snap = m.snapshot()
    assert snap.total_requests == 3
    assert snap.total_errors == 1
    assert snap.error_rate == pytest.approx(1 / 3)
    assert snap.latency_avg_ms == pytest.approx(35.0 / 3)


def test_metrics_reset():
    m = InMemoryRequestMetrics()
    m.record(status_code=200, latency_ms=10.0)
    m.reset()
    snap = m.snapshot()
    assert snap.total_requests == 0
    assert snap.total_errors == 0
    assert snap.latency_avg_ms == 0.0


def test_metrics_p50_p99():
    m = InMemoryRequestMetrics()
    for i in range(1, 101):
        m.record(status_code=200, latency_ms=float(i))
    snap = m.snapshot()
    # p50 should be around 50ms, p99 should be around 99ms
    assert 45.0 <= snap.latency_p50_ms <= 55.0
    assert 95.0 <= snap.latency_p99_ms <= 100.0


# ---------------------------------------------------------------------------
# Settings validation
# ---------------------------------------------------------------------------


def test_settings_reject_nonpositive_guest_access_token_ttl():
    with pytest.raises(ValidationError, match=r"GUEST_ACCESS_TOKEN_TTL_MINUTES must be greater than 0\."):
        Settings(guest_access_token_ttl_minutes=0)


def test_settings_reject_excessive_guest_access_token_ttl():
    with pytest.raises(
        ValidationError,
        match=(f"GUEST_ACCESS_TOKEN_TTL_MINUTES must be less than or equal to {GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES}\\."),
    ):
        Settings(guest_access_token_ttl_minutes=GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES + 1)
