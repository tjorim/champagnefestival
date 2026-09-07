"""Shared rate-limiting helpers.

Two implementations coexist here, a deliberate split made by
docs/decisions/932-multi-worker-state.md decision 1, not a migration in
progress:

- Check-in's per-registration limit and shared-IP backstop (the
  security/abuse-sensitive paths, per #921's already-shipped keying work) are
  Postgres-backed (``check_rate_limit_pg`` / ``check_check_in_rate_limit``) so
  they're enforced consistently across worker processes. #941's push
  subscription mutation endpoints (``check_push_subscription_rate_limit``)
  join this group too — anonymous, public, unauthenticated write endpoints
  are exactly the abuse-sensitive category this split exists for (see
  docs/decisions/941-web-push-foundation.md).
- The remaining scopes (``contact-submission``, ``registration-create``,
  ``registration-access-request``, ``push-test-send``, ``composer-schedule``)
  stay on the in-process deque below (``check_rate_limit``). They're
  process-local — in a multi-worker deployment each worker maintains its own
  buckets, so the effective limit is max_requests × number_of_workers per
  client IP (or, for ``push-test-send``/``composer-schedule``, per admin
  actor) — and that's an accepted, documented gap for now, the same
  treatment decision 1 gives slowapi's blanket per-route limiter: revisit
  only if it turns out to matter in
  practice. Today's single-worker deployment (DEPLOYMENT.md) makes this a
  forward-looking constraint, not a live bug.
"""

from __future__ import annotations

import collections
import ipaddress
from datetime import UTC, datetime, timedelta

from fastapi import Request
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RateLimitBucket

_RATE_LIMIT_MAX_REQUESTS = 5
_RATE_LIMIT_WINDOW_SECONDS = 600
_CHECK_IN_REGISTRATION_MAX_REQUESTS = 10
_CHECK_IN_IP_MAX_REQUESTS = 300
_CHECK_IN_WINDOW_SECONDS = 600
_PUSH_SUBSCRIPTION_MAX_REQUESTS = 20
_PUSH_SUBSCRIPTION_WINDOW_SECONDS = 600
_RATE_LIMIT_BUCKET_CAP = 10_000
_rate_limit_buckets: dict[tuple[str, str], collections.deque[datetime]] = {}

# Cannot appear in a scope constant (fixed internal strings) or in a bucket
# key (an IP address — including IPv6, which contains colons — or a
# make_id()-generated registration ID), so packing "scope<sep>key" into
# RateLimitBucket.key is unambiguous even though we never need to unpack it.
_BUCKET_KEY_SEPARATOR = "\x1f"

# Matches RateLimitBucket.key's column width (models.py). check-in's
# reservation_id is an unauthenticated path parameter reaching this function
# before any token validation, so an attacker-controlled overlong value must
# be rejected here rather than left to the VARCHAR(300) column: a DataError
# from an oversized key would raise mid-transaction and roll back an
# already-successful earlier bucket increment in the same call (e.g.
# check_check_in_rate_limit's IP-scope check before its registration-scope
# one) — silently defeating the venue-wide IP backstop for exactly the
# crafted-input traffic it exists to catch (PR #1011 review).
_BUCKET_KEY_MAX_LENGTH = 300

_UPSERT_BUCKET_SQL = text(
    """
    INSERT INTO rate_limit_buckets (key, window_start, count)
    VALUES (:key, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit_buckets.window_start <= now() - make_interval(secs => :window_seconds)
                 THEN 1 ELSE rate_limit_buckets.count + 1 END,
        window_start = CASE WHEN rate_limit_buckets.window_start <= now() - make_interval(secs => :window_seconds)
                        THEN now() ELSE rate_limit_buckets.window_start END
    RETURNING count
    """
)


def _evict_expired_or_oldest_bucket(now: datetime) -> None:
    """Keep process-local limiter storage bounded when new keys arrive."""
    for bucket_key, bucket in list(_rate_limit_buckets.items()):
        cutoff = now - timedelta(seconds=_CHECK_IN_WINDOW_SECONDS)
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if not bucket:
            _rate_limit_buckets.pop(bucket_key, None)

    if len(_rate_limit_buckets) >= _RATE_LIMIT_BUCKET_CAP:
        oldest_key = min(_rate_limit_buckets, key=lambda item: _rate_limit_buckets[item][-1])
        _rate_limit_buckets.pop(oldest_key, None)


def _peer_is_trusted_proxy(request: Request) -> bool:
    """Whether the immediate TCP peer is a private-network address.

    ``X-Real-IP`` is only trustworthy when the request actually arrived via
    our reverse proxy rather than being sent directly by an arbitrary peer,
    who could otherwise set the header to whatever they like. The proxy
    always connects from a private address (loopback/Docker network), so
    requiring that lets us tell the two apart without hardcoding the proxy's
    exact address.
    """
    if not request.client or not request.client.host:
        return False
    try:
        return ipaddress.ip_address(request.client.host).is_private
    except ValueError:
        return False


def get_client_ip(request: Request) -> str:
    """Best-effort real client IP behind a reverse proxy.

    Only trusts ``X-Real-IP`` when the immediate connection peer is a
    private-network address, i.e. it actually came through the reverse
    proxy rather than being spoofed by an arbitrary caller — see
    backend/README.md. Otherwise falls back to the direct connection IP.
    """
    if _peer_is_trusted_proxy(request):
        real_ip = request.headers.get("X-Real-IP")
        if real_ip and real_ip.strip():
            return real_ip.strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(
    key: str,
    *,
    scope: str,
    max_requests: int = _RATE_LIMIT_MAX_REQUESTS,
    window_seconds: int = _RATE_LIMIT_WINDOW_SECONDS,
) -> bool:
    """Consume one request from an explicitly scoped in-process bucket."""
    now = datetime.now(UTC)
    cutoff = now - timedelta(seconds=window_seconds)
    bucket_key = (scope, key)
    bucket = _rate_limit_buckets.get(bucket_key)
    if bucket is None:
        _evict_expired_or_oldest_bucket(now)
        bucket = collections.deque()
        _rate_limit_buckets[bucket_key] = bucket
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= max_requests:
        return False
    bucket.append(now)
    return True


async def check_rate_limit_pg(
    db: AsyncSession,
    key: str,
    *,
    scope: str,
    max_requests: int,
    window_seconds: int,
) -> bool:
    """Consume one request from a scoped, cross-worker Postgres-backed bucket.

    One atomic ``INSERT ... ON CONFLICT ... RETURNING`` round trip against
    ``rate_limit_buckets`` — race-free across worker processes. This is a
    **fixed-window** counter, not the sliding-window deque ``check_rate_limit``
    uses below: a burst can allow up to ~2x the limit right at a window
    boundary, the standard tradeoff most production rate limiters make at this
    scale (docs/decisions/932-multi-worker-state.md decision 1).

    Returns ``False`` without touching the database if the packed key would
    exceed ``RateLimitBucket.key``'s column width — see
    ``_BUCKET_KEY_MAX_LENGTH``.
    """
    packed_key = f"{scope}{_BUCKET_KEY_SEPARATOR}{key}"
    if len(packed_key) > _BUCKET_KEY_MAX_LENGTH:
        return False
    result = await db.execute(
        _UPSERT_BUCKET_SQL,
        {"key": packed_key, "window_seconds": window_seconds},
    )
    count = result.scalar_one()
    return count <= max_requests


async def check_check_in_rate_limit(db: AsyncSession, registration_id: str, client_ip: str) -> bool:
    """Limit token attempts per registration, with a high per-IP abuse backstop.

    Venue devices commonly share one public IP. The registration bucket stops
    repeated guessing against one QR credential without making unrelated guests
    consume the same small allowance; the IP bucket only catches bulk abuse.
    Postgres-backed (see module docstring) so both hold across worker processes.
    """
    if not await check_rate_limit_pg(
        db,
        client_ip,
        scope="check-in-ip",
        max_requests=_CHECK_IN_IP_MAX_REQUESTS,
        window_seconds=_CHECK_IN_WINDOW_SECONDS,
    ):
        return False
    return await check_rate_limit_pg(
        db,
        registration_id,
        scope="check-in-registration",
        max_requests=_CHECK_IN_REGISTRATION_MAX_REQUESTS,
        window_seconds=_CHECK_IN_WINDOW_SECONDS,
    )


async def check_push_subscription_rate_limit(db: AsyncSession, client_ip: str) -> bool:
    """Limit push subscribe/unsubscribe mutations per IP (#941).

    Postgres-backed (see module docstring): these are anonymous, public,
    unauthenticated write endpoints in the same abuse-sensitive category as
    check-in — a single shared scope covers both subscribe and unsubscribe,
    since neither alone is more sensitive than the other and venue devices
    can share one public IP the same way check-in's own IP backstop
    accounts for.
    """
    return await check_rate_limit_pg(
        db,
        client_ip,
        scope="push-subscription-mutation",
        max_requests=_PUSH_SUBSCRIPTION_MAX_REQUESTS,
        window_seconds=_PUSH_SUBSCRIPTION_WINDOW_SECONDS,
    )


async def cleanup_expired_rate_limit_buckets(db: AsyncSession, *, older_than_seconds: int = 86400) -> int:
    """Delete stale ``rate_limit_buckets`` rows; called by the daily worker sweep.

    A row's window is at most ``window_seconds`` wide (600s for check-in
    today), so anything older than a day is unambiguously expired — a
    generous margin, not a tight one, matching the outbox cleanup's daily
    cadence rather than trying to match each scope's own window exactly.
    """
    deleted_ids = (
        await db.scalars(
            delete(RateLimitBucket)
            .where(RateLimitBucket.window_start < datetime.now(UTC) - timedelta(seconds=older_than_seconds))
            .returning(RateLimitBucket.key)
        )
    ).all()
    await db.commit()
    return len(deleted_ids)
