"""Shared in-process rate-limiting helpers.

NOTE: these limiters are process-local. In a multi-worker deployment each worker
maintains its own buckets, so the effective limit is
max_requests × number_of_workers per client IP. Replace with a Redis-backed
implementation if strict per-IP enforcement across workers is required.
"""

from __future__ import annotations

import collections
import ipaddress
from datetime import UTC, datetime, timedelta

from fastapi import Request

_RATE_LIMIT_MAX_REQUESTS = 5
_RATE_LIMIT_WINDOW_SECONDS = 600
_rate_limit_buckets: dict[str, collections.deque[datetime]] = {}


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


def check_rate_limit(client_ip: str) -> bool:
    """Return True if the request is within the rate limit, False otherwise."""
    now = datetime.now(UTC)
    cutoff = now - timedelta(seconds=_RATE_LIMIT_WINDOW_SECONDS)
    bucket = _rate_limit_buckets.setdefault(client_ip, collections.deque())
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= _RATE_LIMIT_MAX_REQUESTS:
        return False
    bucket.append(now)
    return True
