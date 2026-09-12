"""Tests for the client-IP resolution helper and both rate-limit backends.

check-in's two scopes are Postgres-backed (check_rate_limit_pg /
check_check_in_rate_limit); the remaining scopes stay on the in-process deque
(check_rate_limit) — see app/ratelimit.py's module docstring. Postgres-backed
tests use db_session directly rather than the client fixture; they don't need
an HTTP layer, and db_session's own per-test cleanup (see conftest.py)
already clears rate_limit_buckets between tests.
"""

from __future__ import annotations

import collections
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from starlette.requests import Request

import app.ratelimit as ratelimit_module
from app.models import RateLimitBucket
from app.ratelimit import (
    check_check_in_rate_limit,
    check_rate_limit,
    check_rate_limit_pg,
    cleanup_expired_rate_limit_buckets,
    get_client_ip,
)


def _make_request(headers: dict[str, str], client_host: str | None = "10.0.0.1") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 12345) if client_host else None,
    }
    return Request(scope)


def test_get_client_ip_prefers_x_real_ip_from_trusted_proxy_peer() -> None:
    request = _make_request({"X-Real-IP": "203.0.113.5"}, client_host="10.0.0.1")
    assert get_client_ip(request) == "203.0.113.5"


def test_get_client_ip_ignores_x_real_ip_from_untrusted_peer() -> None:
    request = _make_request({"X-Real-IP": "203.0.113.5"}, client_host="8.8.8.8")
    assert get_client_ip(request) == "8.8.8.8"


def test_get_client_ip_ignores_x_forwarded_for() -> None:
    request = _make_request({"X-Forwarded-For": "203.0.113.5, 198.51.100.9"}, client_host="10.0.0.1")
    assert get_client_ip(request) == "10.0.0.1"


def test_get_client_ip_falls_back_to_direct_connection() -> None:
    request = _make_request({}, client_host="192.0.2.1")
    assert get_client_ip(request) == "192.0.2.1"


def test_get_client_ip_returns_unknown_with_no_signal() -> None:
    request = _make_request({}, client_host=None)
    assert get_client_ip(request) == "unknown"


def test_get_client_ip_treats_invalid_peer_host_as_untrusted() -> None:
    request = _make_request({"X-Real-IP": "203.0.113.5"}, client_host="not-an-ip")
    assert get_client_ip(request) == "not-an-ip"


def test_public_rate_limit_buckets_are_split_by_scope() -> None:
    for _ in range(5):
        assert check_rate_limit("203.0.113.5", scope="registration-create")

    assert not check_rate_limit("203.0.113.5", scope="registration-create")
    assert check_rate_limit("203.0.113.5", scope="visitor-magic-link-request")


def test_new_bucket_evicts_expired_entries() -> None:
    expired = datetime.now(UTC) - timedelta(seconds=601)
    ratelimit_module._rate_limit_buckets[("contact-submission", "expired")] = collections.deque([expired])

    assert check_rate_limit("new", scope="registration-create")
    assert ("contact-submission", "expired") not in ratelimit_module._rate_limit_buckets


# ---------------------------------------------------------------------------
# Postgres-backed limiter (check-in's two scopes — #932 decision 1)
# ---------------------------------------------------------------------------


async def test_check_in_rate_limit_is_independent_per_registration(db_session) -> None:
    for index in range(40):
        assert await check_check_in_rate_limit(db_session, f"reg-{index}", "203.0.113.5")


async def test_check_in_rate_limit_rejects_repeated_attempts_for_one_registration(db_session) -> None:
    for _ in range(10):
        assert await check_check_in_rate_limit(db_session, "reg-target", "203.0.113.5")

    assert not await check_check_in_rate_limit(db_session, "reg-target", "203.0.113.5")


async def test_ip_limit_is_checked_before_registration_bucket_is_allocated(db_session) -> None:
    for index in range(300):
        assert await check_check_in_rate_limit(db_session, f"reg-{index}", "203.0.113.5")

    assert not await check_check_in_rate_limit(db_session, "attacker-controlled-id", "203.0.113.5")
    key = f"check-in-registration{ratelimit_module._BUCKET_KEY_SEPARATOR}attacker-controlled-id"
    result = await db_session.execute(select(RateLimitBucket).where(RateLimitBucket.key == key))
    assert result.scalar_one_or_none() is None


async def test_check_rate_limit_pg_survives_a_later_rollback(db_session) -> None:
    """Regression: the increment must be durable even if the caller's request
    later fails and rolls back — app/routers/check_in.py commits immediately
    after this check for exactly that reason (a wrong-token guess still 401s,
    but must still count against the limiter guarding it).
    """
    for _ in range(3):
        assert await check_rate_limit_pg(
            db_session, "9.9.9.9", scope="pg-durability", max_requests=3, window_seconds=600
        )
        await db_session.commit()

    await db_session.rollback()  # simulate the guarded request failing afterwards
    assert not await check_rate_limit_pg(
        db_session, "9.9.9.9", scope="pg-durability", max_requests=3, window_seconds=600
    )


async def test_check_rate_limit_pg_rejects_an_oversized_key_without_a_db_error(db_session) -> None:
    """Regression (PR #1011 review): a packed key over RateLimitBucket.key's
    300-char column width must be rejected in Python, not raise a DataError
    mid-transaction — which would roll back an earlier successful check in
    the same call (see check_check_in_rate_limit's IP-then-registration order).
    """
    oversized_key = "x" * 400
    assert not await check_rate_limit_pg(
        db_session, oversized_key, scope="pg-oversized", max_requests=5, window_seconds=600
    )
    result = await db_session.execute(select(RateLimitBucket))
    assert result.scalars().all() == []


async def test_check_rate_limit_pg_rejects_after_max_requests(db_session) -> None:
    for _ in range(3):
        assert await check_rate_limit_pg(
            db_session, "1.2.3.4", scope="pg-test-scope", max_requests=3, window_seconds=600
        )
    assert not await check_rate_limit_pg(
        db_session, "1.2.3.4", scope="pg-test-scope", max_requests=3, window_seconds=600
    )


async def test_check_rate_limit_pg_scopes_are_independent(db_session) -> None:
    for _ in range(2):
        assert await check_rate_limit_pg(db_session, "1.2.3.4", scope="pg-scope-a", max_requests=2, window_seconds=600)
    assert not await check_rate_limit_pg(db_session, "1.2.3.4", scope="pg-scope-a", max_requests=2, window_seconds=600)
    assert await check_rate_limit_pg(db_session, "1.2.3.4", scope="pg-scope-b", max_requests=2, window_seconds=600)


async def test_check_rate_limit_pg_resets_after_window_rollover(db_session) -> None:
    assert await check_rate_limit_pg(db_session, "5.6.7.8", scope="pg-rollover", max_requests=1, window_seconds=600)
    assert not await check_rate_limit_pg(db_session, "5.6.7.8", scope="pg-rollover", max_requests=1, window_seconds=600)

    # Force the window to look expired, mirroring test_new_bucket_evicts_expired_entries's
    # direct-manipulation approach for the in-process backend above.
    key = f"pg-rollover{ratelimit_module._BUCKET_KEY_SEPARATOR}5.6.7.8"
    bucket = (await db_session.execute(select(RateLimitBucket).where(RateLimitBucket.key == key))).scalar_one()
    bucket.window_start = datetime.now(UTC) - timedelta(seconds=601)
    await db_session.commit()

    assert await check_rate_limit_pg(db_session, "5.6.7.8", scope="pg-rollover", max_requests=1, window_seconds=600)


async def test_cleanup_expired_rate_limit_buckets_removes_only_stale_rows(db_session) -> None:
    db_session.add(RateLimitBucket(key="stale", window_start=datetime.now(UTC) - timedelta(days=2), count=1))
    db_session.add(RateLimitBucket(key="fresh", window_start=datetime.now(UTC), count=1))
    await db_session.commit()

    deleted = await cleanup_expired_rate_limit_buckets(db_session, older_than_seconds=86400)

    assert deleted == 1
    remaining = (await db_session.execute(select(RateLimitBucket.key))).scalars().all()
    assert remaining == ["fresh"]


def test_bucket_storage_has_a_hard_cap(monkeypatch) -> None:
    monkeypatch.setattr(ratelimit_module, "_RATE_LIMIT_BUCKET_CAP", 3)
    now = datetime.now(UTC)
    for index in range(3):
        ratelimit_module._rate_limit_buckets[("scope", str(index))] = collections.deque(
            [now + timedelta(microseconds=index)]
        )

    assert check_rate_limit("new", scope="scope")
    assert len(ratelimit_module._rate_limit_buckets) == 3
    assert ("scope", "0") not in ratelimit_module._rate_limit_buckets
