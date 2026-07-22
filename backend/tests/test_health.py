"""Tests for the health check endpoints, metrics endpoint, and application settings validation."""

from __future__ import annotations

import time

import pytest
from pydantic import ValidationError

from app.config import GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES, Settings
from app.observability import InMemoryRequestMetrics
from app.routers.health import build_metrics_token

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
async def test_jwks_reachable_coalesces_concurrent_cache_misses(monkeypatch):
    from app.routers import health

    calls = 0

    async def reachable() -> bool:
        nonlocal calls
        calls += 1
        await health.asyncio.sleep(0)
        return True

    monkeypatch.setattr(health, "_jwks_readiness_cache", None)
    monkeypatch.setattr(health, "_check_jwks_reachable", reachable)

    results = await health.asyncio.gather(*(health._jwks_reachable() for _ in range(5)))

    assert results == [True] * 5
    assert calls == 1


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
    monkeypatch.setattr("app.routers.health.settings", type("S", (), {"metrics_hmac_secret": "correct"})())
    r = await client.get("/api/metrics", headers={"X-Metrics-Token": build_metrics_token("wrong")})
    assert r.status_code == 403


@pytest.mark.anyio
async def test_metrics_forbidden_malformed_token(client, monkeypatch):
    monkeypatch.setattr("app.routers.health.settings", type("S", (), {"metrics_hmac_secret": "mysecret"})())
    r = await client.get("/api/metrics", headers={"X-Metrics-Token": "not-a-valid-token"})
    assert r.status_code == 403


@pytest.mark.anyio
async def test_metrics_forbidden_stale_token(client, monkeypatch):
    monkeypatch.setattr("app.routers.health.settings", type("S", (), {"metrics_hmac_secret": "mysecret"})())
    stale_timestamp = int(time.time()) - 61
    r = await client.get(
        "/api/metrics",
        headers={"X-Metrics-Token": build_metrics_token("mysecret", timestamp=stale_timestamp)},
    )
    assert r.status_code == 403


@pytest.mark.anyio
async def test_metrics_ok_with_secret(client, monkeypatch):
    monkeypatch.setattr("app.routers.health.settings", type("S", (), {"metrics_hmac_secret": "mysecret"})())
    r = await client.get("/api/metrics", headers={"X-Metrics-Token": build_metrics_token("mysecret")})
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


def test_settings_reject_production_without_qr_secret():
    with pytest.raises(ValidationError, match=r"QR_SIGNING_SECRET must be set in production\."):
        Settings(environment="production", oidc_issuer_url="https://auth.example.com", qr_signing_secret="")


def test_settings_reject_production_without_trusted_hosts():
    with pytest.raises(ValidationError, match=r"TRUSTED_HOSTS must be set in production\."):
        Settings(
            environment="production",
            oidc_issuer_url="https://auth.example.com",
            qr_signing_secret="secret",
            trusted_hosts="",
        )


def test_settings_get_trusted_hosts_list_parses_comma_separated_values():
    settings = Settings(trusted_hosts="champagnefestival.tjor.im, *.example.com")
    assert settings.get_trusted_hosts_list() == ["champagnefestival.tjor.im", "*.example.com"]


def test_settings_reject_sentry_traces_sample_rate_above_one():
    with pytest.raises(ValidationError, match=r"SENTRY_TRACES_SAMPLE_RATE must be between 0.0 and 1.0\."):
        Settings(sentry_traces_sample_rate=1.5)


def test_settings_reject_sentry_traces_sample_rate_below_zero():
    with pytest.raises(ValidationError, match=r"SENTRY_TRACES_SAMPLE_RATE must be between 0.0 and 1.0\."):
        Settings(sentry_traces_sample_rate=-0.1)


def test_settings_reject_invalid_rate_limit_default():
    with pytest.raises(ValidationError, match=r"RATE_LIMIT_DEFAULT is not a valid rate limit string"):
        Settings(rate_limit_default="not-a-rate-limit")


def test_settings_builds_database_url_from_parts(tmp_path):
    password_file = tmp_path / "db_password"
    password_file.write_text("s3cr3t/p@ss\n")

    settings = Settings(
        database_url="",
        db_host="postgres",
        db_port=5544,
        db_name="champagnefestival",
        db_user="champagnefestival_user",
        db_password_file=str(password_file),
    )

    assert settings.database_url == (
        "postgresql+asyncpg://champagnefestival_user:s3cr3t%2Fp%40ss@postgres:5544/champagnefestival"
    )


def test_settings_database_url_override_wins_over_db_parts(tmp_path):
    password_file = tmp_path / "db_password"
    password_file.write_text("unused")

    settings = Settings(
        database_url="postgresql+asyncpg://explicit:pw@localhost:5432/explicit_db",
        db_host="postgres",
        db_name="champagnefestival",
        db_user="champagnefestival_user",
        db_password_file=str(password_file),
    )

    assert settings.database_url == "postgresql+asyncpg://explicit:pw@localhost:5432/explicit_db"


def test_settings_missing_db_password_file_raises():
    with pytest.raises(ValidationError, match=r"DB_PASSWORD_FILE could not be read"):
        Settings(
            database_url="",
            db_host="postgres",
            db_name="champagnefestival",
            db_user="champagnefestival_user",
            db_password_file="/nonexistent/path/to/secret",
        )
