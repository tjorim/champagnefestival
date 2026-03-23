"""Shared in-process rate-limiting helpers.

NOTE: this limiter is process-local. In a multi-worker deployment each worker
maintains its own bucket, so the effective limit is
_RATE_LIMIT_MAX_REQUESTS × number_of_workers per client IP. Replace with a
Redis-backed implementation if strict per-IP enforcement across workers is
required.
"""

from __future__ import annotations

import collections
from datetime import UTC, datetime, timedelta

_RATE_LIMIT_MAX_REQUESTS = 5
_RATE_LIMIT_WINDOW_SECONDS = 600
_rate_limit_buckets: dict[str, collections.deque[datetime]] = {}


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
