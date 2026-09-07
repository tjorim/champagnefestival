"""Postgres LISTEN/NOTIFY fan-out into the local in-process LiveBus.

docs/decisions/932-multi-worker-state.md decision 2. Mirrors tjorim/worktime's
``backend/app/utils/sse_manager.py`` LISTEN half: a dedicated asyncpg
connection (bypassing the SQLAlchemy pool — a long-lived LISTEN connection
doesn't belong in a request-scoped pool) relays every notification on
``live_events`` into this worker's local ``LiveBus``, including notifications
this same worker produced. There is no separate "publish immediately, then
also relay" path — every event reaches ``LiveBus.publish`` exactly once, via
this listener, whether it originated in this worker or another one, so
behaviour is uniform across single- and multi-worker deployments.

If LISTEN/NOTIFY setup fails at startup, this logs a warning and the process
degrades to no live-update delivery until the next successful (re)connect —
the same "notify-then-pull" contract already tolerates a client missing
events by reconnecting and doing a blanket invalidate (#929), so a gap here
is a staleness window, not a correctness bug.
"""

from __future__ import annotations

import asyncio
import contextlib
import functools
import logging

import asyncpg

from app.live.bus import live_bus
from app.live.events import LiveEvent
from app.live.notify import LIVE_EVENTS_CHANNEL

logger = logging.getLogger(__name__)

_RECONNECT_INITIAL_DELAY_SECONDS = 1.0
_RECONNECT_MAX_DELAY_SECONDS = 60.0


def _to_asyncpg_dsn(database_url: str) -> str:
    """Strip the ``+asyncpg`` SQLAlchemy dialect suffix for direct asyncpg use.

    ``app.config.Settings.validate_database_url`` already guarantees
    *database_url* starts with ``postgresql+asyncpg://``.
    """
    return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


class PgLiveListener:
    """Owns the background LISTEN connection and relays into ``live_bus``.

    One instance per process; started/stopped from the FastAPI lifespan.
    """

    def __init__(self) -> None:
        self._conn: asyncpg.Connection | None = None
        self._dsn: str | None = None
        self._closing = True
        self._reconnect_task: asyncio.Task[None] | None = None

    async def start(self, database_url: str) -> None:
        """Open the LISTEN connection and register the notification callback.

        Failures are logged and swallowed — the app continues to serve
        requests, just without live-update delivery until a reconnect
        succeeds (see the module docstring).
        """
        self._dsn = _to_asyncpg_dsn(database_url)
        self._closing = False
        try:
            await self._connect()
            logger.info("✓ Live bus: Postgres LISTEN connection established on channel %r", LIVE_EVENTS_CHANNEL)
        except Exception:
            logger.warning(
                "Live bus: Postgres LISTEN setup failed — live updates will not be delivered until reconnect",
                exc_info=True,
            )
            await self.stop()

    async def _connect(self) -> None:
        conn = await asyncpg.connect(self._dsn)
        try:
            await conn.add_listener(LIVE_EVENTS_CHANNEL, self._on_notify)
            conn.add_termination_listener(functools.partial(self._on_terminated))
        except BaseException:
            await conn.close()
            raise
        self._conn = conn

    async def _on_notify(self, connection: asyncpg.Connection, pid: int, channel: str, payload: str) -> None:
        """asyncpg LISTEN callback — relay one NOTIFY into the local LiveBus.

        Called for every notification on this worker's LISTEN connection,
        including ones this same worker's ``notify_live_event`` sent — see
        the module docstring for why that's the only delivery path.
        """
        try:
            event = LiveEvent.from_notify_payload(payload)
        except (KeyError, ValueError, TypeError):
            logger.warning("Live bus: dropped malformed NOTIFY payload: %r", payload)
            return
        await live_bus.publish(event)

    def _on_terminated(self, connection: asyncpg.Connection) -> None:
        """Fires for both an intentional stop() close and an unexpected drop.

        ``_closing`` distinguishes the two so an intentional shutdown doesn't
        schedule a pointless reconnect.
        """
        if self._closing:
            return
        self._conn = None
        if self._reconnect_task is not None and not self._reconnect_task.done():
            return
        logger.warning("Live bus: Postgres LISTEN connection terminated unexpectedly — scheduling reconnect")
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
                    "Live bus: Postgres LISTEN reconnect attempt failed — retrying in %.0fs", delay, exc_info=True
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, _RECONNECT_MAX_DELAY_SECONDS)
            else:
                logger.info("✓ Live bus: Postgres LISTEN connection re-established")
                return

    async def stop(self) -> None:
        """Cancel any in-flight reconnect and close the LISTEN connection."""
        self._closing = True
        if self._reconnect_task is not None:
            self._reconnect_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reconnect_task
            self._reconnect_task = None
        if self._conn is not None:
            conn, self._conn = self._conn, None
            try:
                await conn.remove_listener(LIVE_EVENTS_CHANNEL, self._on_notify)
                await conn.close()
            except Exception:
                logger.debug("Live bus: error closing LISTEN connection", exc_info=True)
            logger.info("Live bus: Postgres LISTEN connection closed")


#: Module-level singleton; started/stopped by app.main's lifespan.
pg_live_listener = PgLiveListener()
