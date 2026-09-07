"""Tests for PgLiveListener's reconnect behaviour (#932 decision 2).

Full end-to-end delivery (a real NOTIFY reaching live_bus) is already
exercised by tests/test_live_broadcasts.py via the session-scoped listener in
conftest.py. This file covers the failure/reconnect path specifically, which
that fixture's happy-path connection never triggers.
"""

from __future__ import annotations

import asyncio

from app.live.listener import PgLiveListener


async def test_start_failure_schedules_reconnect_instead_of_stopping():
    """Regression (PR #1011 review): an initial connection failure must not
    call stop() — that sets _closing, permanently disabling the same
    reconnect-with-backoff loop a later unexpected drop relies on.
    """
    listener = PgLiveListener()
    try:
        # An unroutable port on localhost fails fast without a long OS-level
        # connect timeout, unlike an unreachable external host would.
        await listener.start("postgresql+asyncpg://postgres:postgres@localhost:1/nonexistent")

        assert listener._closing is False
        assert listener._reconnect_task is not None
        assert not listener._reconnect_task.done()
    finally:
        await listener.stop()


async def test_stop_before_any_successful_connect_cancels_the_reconnect_task():
    listener = PgLiveListener()
    await listener.start("postgresql+asyncpg://postgres:postgres@localhost:1/nonexistent")
    reconnect_task = listener._reconnect_task
    assert reconnect_task is not None

    await listener.stop()

    assert listener._closing is True
    assert listener._reconnect_task is None
    assert reconnect_task.done()


async def test_reconnect_succeeds_once_the_database_becomes_reachable(engine):
    """The reconnect loop started by a failed start() must pick up a real
    connection once one becomes available, not just retry forever.
    """
    from app.live.listener import _to_asyncpg_dsn
    from tests.conftest import TEST_DATABASE_URL

    listener = PgLiveListener()
    try:
        await listener.start("postgresql+asyncpg://postgres:postgres@localhost:1/nonexistent")
        assert listener._conn is None

        # Point the in-flight reconnect loop at the real test database — it
        # re-reads self._dsn on every retry, so this simulates the address
        # becoming reachable without needing an actually-flaky target.
        listener._dsn = _to_asyncpg_dsn(TEST_DATABASE_URL)

        async def _connected() -> None:
            while listener._conn is None:
                await asyncio.sleep(0.05)

        await asyncio.wait_for(_connected(), timeout=5.0)
        assert listener._conn is not None
    finally:
        await listener.stop()
