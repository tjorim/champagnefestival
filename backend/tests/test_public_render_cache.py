"""Tests for #992's in-process TTL render cache (subscribe/unsubscribe don't
apply here — this is the pure caching primitive, not a route)."""

from __future__ import annotations

import asyncio

import pytest

from app.services.public_render_cache import RenderCache


async def test_get_or_render_renders_once_and_reuses_within_ttl():
    cache = RenderCache(ttl_seconds=60)
    calls = 0

    async def render() -> str:
        nonlocal calls
        calls += 1
        return f"value-{calls}"

    first = await cache.get_or_render("key", render)
    second = await cache.get_or_render("key", render)

    assert first == "value-1"
    assert second == "value-1"
    assert calls == 1


async def test_get_or_render_times_the_entry_from_completion_not_start():
    """Regression: rendered_at must be set after render() returns, not
    before it's called — otherwise a render slower than the TTL stores an
    entry that's already expired, forcing every following request to
    re-render too instead of ever serving from cache.
    """
    cache = RenderCache(ttl_seconds=0.05)
    calls = 0

    async def slow_render() -> str:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.1)  # longer than the TTL
        return f"value-{calls}"

    await cache.get_or_render("key", slow_render)
    await cache.get_or_render("key", slow_render)

    assert calls == 1


async def test_get_or_render_refreshes_after_ttl_expiry():
    # A short real TTL plus a real sleep, rather than monkeypatching
    # time.monotonic — asyncio's own scheduling relies on that clock too, so
    # faking it globally risks disrupting the event loop, not just the cache.
    cache = RenderCache(ttl_seconds=0.05)
    calls = 0

    async def render() -> str:
        nonlocal calls
        calls += 1
        return f"value-{calls}"

    first = await cache.get_or_render("key", render)
    await asyncio.sleep(0.1)
    second = await cache.get_or_render("key", render)

    assert first == "value-1"
    assert second == "value-2"
    assert calls == 2


async def test_get_or_render_serves_stale_value_when_refresh_fails():
    cache = RenderCache(ttl_seconds=0.05)

    async def render_ok() -> str:
        return "good"

    async def render_fails() -> str:
        raise RuntimeError("db is down")

    first = await cache.get_or_render("key", render_ok)
    await asyncio.sleep(0.1)
    second = await cache.get_or_render("key", render_fails)

    assert first == "good"
    assert second == "good"


async def test_get_or_render_reraises_on_a_cold_cache_with_a_failing_refresh():
    cache = RenderCache(ttl_seconds=60)

    async def render_fails() -> str:
        raise RuntimeError("db is down")

    with pytest.raises(RuntimeError, match="db is down"):
        await cache.get_or_render("key", render_fails)


async def test_invalidate_forces_every_entry_to_refresh():
    cache = RenderCache(ttl_seconds=60)
    calls = 0

    async def render() -> str:
        nonlocal calls
        calls += 1
        return f"value-{calls}"

    await cache.get_or_render("a", render)
    await cache.get_or_render("b", render)
    assert calls == 2

    cache.invalidate()

    await cache.get_or_render("a", render)
    await cache.get_or_render("b", render)
    assert calls == 4


async def test_invalidate_preserves_last_known_good_for_a_subsequent_failure():
    """Regression: invalidate() must not discard values outright — a mutation
    NOTIFY fires often enough that a transient database failure on the very
    next request would otherwise have nothing to fall back to, breaking the
    last-known-good contract right when it matters most.
    """
    cache = RenderCache(ttl_seconds=60)

    async def render_ok() -> str:
        return "good"

    async def render_fails() -> str:
        raise RuntimeError("db is down")

    await cache.get_or_render("key", render_ok)
    cache.invalidate()

    assert await cache.get_or_render("key", render_fails) == "good"


async def test_keys_are_independent():
    cache = RenderCache(ttl_seconds=60)

    async def render_a() -> str:
        return "a-value"

    async def render_b() -> str:
        return "b-value"

    assert await cache.get_or_render("a", render_a) == "a-value"
    assert await cache.get_or_render("b", render_b) == "b-value"
