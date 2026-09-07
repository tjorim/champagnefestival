"""Postgres LISTEN for the render-cache invalidation channel (#992).

Structurally mirrors ``app.live.listener.PgLiveListener`` (same reconnect-
with-backoff shape), kept as its own class rather than generalizing that one
into a multi-channel listener — this channel's payload is empty (a blanket
invalidate, see ``app.services.public_render_cache.RenderCache.invalidate``),
it has nothing to relay into ``LiveBus``, and duplicating this much simpler
shape carries far less risk than reworking already-shipped, tested #932
code. Started/stopped from ``app.main``'s lifespan alongside ``pg_live_listener``.
"""

from __future__ import annotations

import asyncio
import contextlib
import functools
import logging

import asyncpg

from app.services.public_render_cache import RENDER_CACHE_INVALIDATE_CHANNEL, public_render_cache

logger = logging.getLogger(__name__)

_RECONNECT_INITIAL_DELAY_SECONDS = 1.0
_RECONNECT_MAX_DELAY_SECONDS = 60.0


def _to_asyncpg_dsn(database_url: str) -> str:
    return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


class PgRenderCacheListener:
    """Owns a dedicated LISTEN connection and clears the render cache on notify.

    One instance per process; started/stopped from the FastAPI lifespan.
    """

    def __init__(self) -> None:
        self._conn: asyncpg.Connection | None = None
        self._dsn: str | None = None
        self._closing = True
        self._reconnect_task: asyncio.Task[None] | None = None

    async def start(self, database_url: str) -> None:
        self._dsn = _to_asyncpg_dsn(database_url)
        self._closing = False
        try:
            await self._connect()
            logger.info(
                "✓ Render cache: Postgres LISTEN connection established on channel %r",
                RENDER_CACHE_INVALIDATE_CHANNEL,
            )
        except Exception:
            logger.warning(
                "Render cache: Postgres LISTEN setup failed — scheduling reconnect; "
                "proactive invalidation will not be delivered until it succeeds "
                "(the 60s TTL still bounds staleness)",
                exc_info=True,
            )
            self._reconnect_task = asyncio.create_task(self._reconnect_with_backoff())

    async def _connect(self) -> None:
        conn = await asyncpg.connect(self._dsn)
        try:
            await conn.add_listener(RENDER_CACHE_INVALIDATE_CHANNEL, self._on_notify)
            conn.add_termination_listener(functools.partial(self._on_terminated))
        except BaseException:
            await conn.close()
            raise
        self._conn = conn

    def _on_notify(self, connection: asyncpg.Connection, pid: int, channel: str, payload: str) -> None:
        public_render_cache.invalidate()

    def _on_terminated(self, connection: asyncpg.Connection) -> None:
        if self._closing:
            return
        self._conn = None
        if self._reconnect_task is not None and not self._reconnect_task.done():
            return
        logger.warning("Render cache: Postgres LISTEN connection terminated unexpectedly — scheduling reconnect")
        self._reconnect_task = asyncio.create_task(self._reconnect_with_backoff())

    async def _reconnect_with_backoff(self) -> None:
        delay = _RECONNECT_INITIAL_DELAY_SECONDS
        while not self._closing:
            try:
                await self._connect()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning(
                    "Render cache: Postgres LISTEN reconnect attempt failed — retrying in %.0fs",
                    delay,
                    exc_info=True,
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, _RECONNECT_MAX_DELAY_SECONDS)
            else:
                logger.info("✓ Render cache: Postgres LISTEN connection re-established")
                return

    async def stop(self) -> None:
        self._closing = True
        if self._reconnect_task is not None:
            self._reconnect_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reconnect_task
            self._reconnect_task = None
        if self._conn is not None:
            conn, self._conn = self._conn, None
            try:
                await conn.remove_listener(RENDER_CACHE_INVALIDATE_CHANNEL, self._on_notify)
                await conn.close()
            except Exception:
                logger.debug("Render cache: error closing LISTEN connection", exc_info=True)
            logger.info("Render cache: Postgres LISTEN connection closed")


#: Module-level singleton; started/stopped by app.main's lifespan.
pg_render_cache_listener = PgRenderCacheListener()
