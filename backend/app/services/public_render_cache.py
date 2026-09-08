"""In-process TTL cache for the server-rendered `/` and `/privacy` fragments (#992).

A 60-second TTL is the
correctness floor regardless of worker count. Proactive invalidation over a
dedicated Postgres NOTIFY channel (kept separate from `app.live.notify`'s
``live_events`` — a render-cache invalidation is a different message shape
than an SSE client's invalidate-these-query-keys event) expires entries
early on FAQ/edition/event/policy mutations, but the TTL is never removed as
a floor: a dropped NOTIFY degrades to at most 60s of staleness, never
unbounded.

Last-known-good: a cache entry is kept past its own expiry and served stale
when a refresh raises, so a transient database failure never 5xxs the public
homepage — only a cold cache (nothing ever successfully rendered) propagates
the failure, letting the caller fall back to the unmodified static shell.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

TTL_SECONDS = 60

#: Postgres NOTIFY channel for render-cache invalidation — see module docstring.
RENDER_CACHE_INVALIDATE_CHANNEL = "public_render_invalidate"

_NOTIFY_SQL = text("SELECT pg_notify(:channel, '')")


@dataclass
class _CacheEntry:
    value: str
    rendered_at: float


class RenderCache:
    """Keyed by an opaque string (route + locale); one entry per key."""

    def __init__(self, ttl_seconds: float = TTL_SECONDS) -> None:
        self._ttl_seconds = ttl_seconds
        self._entries: dict[str, _CacheEntry] = {}

    async def get_or_render(self, key: str, render: Callable[[], Awaitable[str]]) -> str:
        """Return the cached value for *key*, refreshing it if expired.

        On a refresh failure, falls back to the previous value if one exists
        (last-known-good — see module docstring) and re-raises only when
        there is nothing to fall back to.
        """
        now = time.monotonic()
        entry = self._entries.get(key)
        if entry is not None and (now - entry.rendered_at) < self._ttl_seconds:
            return entry.value
        try:
            value = await render()
        except Exception:
            if entry is not None:
                logger.warning("public_render_cache: refresh failed for key=%r, serving stale value.", key)
                return entry.value
            raise
        # Timestamp taken after render() returns, not before — otherwise a
        # render slower than the TTL would store an entry already expired,
        # forcing every subsequent request to re-render too.
        self._entries[key] = _CacheEntry(value=value, rendered_at=time.monotonic())
        return value

    def invalidate(self) -> None:
        """Force every entry to re-render on its next request, without
        discarding the values themselves — a blanket invalidate, not per-key.

        Resets each entry's `rendered_at` to force a refresh rather than
        deleting it: dropping the value here would break the last-known-good
        contract (see module docstring) for the specific window right after
        an invalidation — a mutation NOTIFY fires often enough that a
        transient database failure on the very next request would otherwise
        have nothing to fall back to.

        Mirrors the notify-then-pull live-update contract's own "reconnect
        does a blanket invalidate" precedent (#929): simpler than tracking
        which of the handful of keys a given mutation could have affected,
        and the cost of over-invalidating is one extra render per key, not a
        correctness issue.
        """
        for entry in self._entries.values():
            entry.rendered_at = 0.0


#: Module-level singleton; each worker process holds its own copy — see the
#: module docstring for why that's fine for a pure cache (unlike #932's rate
#: limiter or live bus, no cross-worker state has to be correct here).
public_render_cache = RenderCache()


async def notify_render_cache_invalidate(db: AsyncSession) -> None:
    """Queue a render-cache invalidation, committed atomically with the caller's write.

    Call before ``db.commit()`` on the same session as the mutation, matching
    ``app.live.notify.notify_live_event``'s contract — Postgres holds a
    NOTIFY sent inside a transaction until it commits, and drops it if the
    transaction rolls back.
    """
    await db.execute(_NOTIFY_SQL, {"channel": RENDER_CACHE_INVALIDATE_CHANNEL})
