"""Tests for PgRenderCacheListener's reconnect behaviour (#992).

Mirrors tests/test_pg_live_listener.py's structure and rationale exactly —
this class is a deliberate near-duplicate of PgLiveListener rather than a
generalization of it, see app.live.render_cache_listener's module docstring.
Full end-to-end delivery (a real NOTIFY clearing the cache) is already
exercised by tests/test_public_pages.py via the session-scoped listener in
conftest.py; this file covers the failure/reconnect path specifically.
"""

from __future__ import annotations

import asyncio

from app.live.render_cache_listener import PgRenderCacheListener


async def test_start_failure_schedules_reconnect_instead_of_stopping():
    listener = PgRenderCacheListener()
    try:
        await listener.start("postgresql+asyncpg://postgres:postgres@localhost:1/nonexistent")

        assert listener._closing is False
        assert listener._reconnect_task is not None
        assert not listener._reconnect_task.done()
    finally:
        await listener.stop()


async def test_stop_before_any_successful_connect_cancels_the_reconnect_task():
    listener = PgRenderCacheListener()
    await listener.start("postgresql+asyncpg://postgres:postgres@localhost:1/nonexistent")
    reconnect_task = listener._reconnect_task
    assert reconnect_task is not None

    await listener.stop()

    assert listener._closing is True
    assert listener._reconnect_task is None
    assert reconnect_task.done()


async def test_reconnect_succeeds_once_the_database_becomes_reachable(engine):
    from app.live.render_cache_listener import _to_asyncpg_dsn
    from tests.conftest import TEST_DATABASE_URL

    listener = PgRenderCacheListener()
    try:
        await listener.start("postgresql+asyncpg://postgres:postgres@localhost:1/nonexistent")
        assert listener._conn is None

        listener._dsn = _to_asyncpg_dsn(TEST_DATABASE_URL)

        async def _connected() -> None:
            while listener._conn is None:
                await asyncio.sleep(0.05)

        await asyncio.wait_for(_connected(), timeout=5.0)
        assert listener._conn is not None
    finally:
        await listener.stop()
