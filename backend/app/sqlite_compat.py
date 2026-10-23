"""SQLite support for local development and the test suite.

Production runs on PostgreSQL; SQLite exists so a dev instance and the tests need no
container. This module covers what the application relies on that SQLite lacks:

* Timezone-aware datetimes. SQLite stores no timezone, so ``DateTime(timezone=True)``
  columns come back naive and comparing them with aware values raises ``TypeError``.
  :class:`UTCDateTime` writes aware values as UTC and reads every value back as UTC.
* Foreign keys, which SQLite ignores unless ``PRAGMA foreign_keys=ON`` runs per connection.
* The PostgreSQL functions the queries call (``unaccent``, ``pg_trgm``'s ``similarity`` and
  ``word_similarity``, ``levenshtein_less_equal``, ``greatest``, ``json_extract_path_text``),
  implemented in :mod:`app.sqlite_functions`.
* ``pg_notify`` and ``pg_advisory_xact_lock``, which the live-update relay and the
  serialised writers call as SQL functions. SQLite has one writer lock, so the advisory
  locks have nothing to do. A notification is queued on its connection and handed to the
  same in-process handlers the PostgreSQL ``LISTEN`` relays call, on commit (and dropped on
  rollback), which is NOTIFY's own transactional contract. It does not cross processes.

Call :func:`configure_engine` on every SQLite engine, before its first connection.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Index, MetaData, PrimaryKeyConstraint, UniqueConstraint, event, types
from sqlalchemy.dialects.sqlite import DATETIME
from sqlalchemy.dialects.sqlite.base import SQLiteDialect
from sqlalchemy.dialects.sqlite.pysqlite import SQLiteDialect_pysqlite
from sqlalchemy.ext.asyncio import AsyncEngine

from app import sqlite_functions

logger = logging.getLogger(__name__)

_installed = False
# Notifications queued by pg_notify on a connection, until it commits or rolls back.
# Keyed by id(): the aiosqlite adapter has __slots__, so it takes neither attributes nor weak references.
_pending_by_connection: dict[int, list[tuple[str, str]]] = {}
_background: set[asyncio.Task[None]] = set()


class UTCDateTime(DATETIME):
    """SQLite ``DATETIME`` that round-trips timezone-aware values as UTC."""

    def bind_processor(self, dialect: Any) -> Any:
        inner = super().bind_processor(dialect)

        def process(value: Any) -> Any:
            if self.timezone and isinstance(value, datetime) and value.tzinfo is not None:
                value = value.astimezone(UTC)
            return inner(value) if inner else value

        return process

    def result_processor(self, dialect: Any, coltype: Any) -> Any:
        inner = super().result_processor(dialect, coltype)

        def process(value: Any) -> Any:
            result = inner(value) if inner else value
            if self.timezone and isinstance(result, datetime) and result.tzinfo is None:
                return result.replace(tzinfo=UTC)
            return result

        return process


# (SQL name, argument count, implementation); -1 means variadic.
_FUNCTIONS = (
    ("unaccent", 1, sqlite_functions.unaccent),
    ("similarity", 2, sqlite_functions.similarity),
    ("word_similarity", 2, sqlite_functions.word_similarity),
    ("levenshtein_less_equal", 3, sqlite_functions.levenshtein_less_equal),
    ("greatest", -1, sqlite_functions.greatest),
    ("json_extract_path_text", -1, sqlite_functions.json_extract_path_text),
    ("champagne_search_name", 1, sqlite_functions.search_name),
    ("champagne_search_name_alt", 1, sqlite_functions.search_name_alt),
)


def _deliver(channel: str, payload: str) -> None:
    """Run what the PostgreSQL LISTEN relay for *channel* would run for this notification."""
    # Imported here: these modules import the database module, which imports this one.
    from app.live.bus import live_bus
    from app.live.events import LiveEvent
    from app.live.notify import LIVE_EVENTS_CHANNEL
    from app.services.public_render_cache import RENDER_CACHE_INVALIDATE_CHANNEL, public_render_cache

    if channel == RENDER_CACHE_INVALIDATE_CHANNEL:
        public_render_cache.invalidate()
    elif channel == LIVE_EVENTS_CHANNEL:
        try:
            event = LiveEvent.from_notify_payload(payload)
        except KeyError, ValueError, TypeError:
            logger.warning("Live bus: dropped malformed notification payload: %r", payload)
            return
        task = asyncio.get_running_loop().create_task(live_bus.publish(event))
        _background.add(task)
        task.add_done_callback(_background.discard)


def _on_connect(dbapi_connection: Any, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()
    queue: list[tuple[str, str]] = []
    _pending_by_connection[id(dbapi_connection)] = queue
    dbapi_connection.create_function("pg_notify", 2, lambda channel, payload: queue.append((channel, payload)))
    dbapi_connection.create_function("pg_advisory_xact_lock", 1, lambda *_: None)
    dbapi_connection.create_function("pg_try_advisory_xact_lock", 1, lambda *_: 1)
    for name, argument_count, function in _FUNCTIONS:
        dbapi_connection.create_function(name, argument_count, function, deterministic=True)


def _on_commit(connection: Any) -> None:
    queue = _pending_by_connection[id(connection.connection.dbapi_connection)]
    notifications, queue[:] = list(queue), []
    for channel, payload in notifications:
        _deliver(channel, payload)


def _on_rollback(connection: Any) -> None:
    _pending_by_connection[id(connection.connection.dbapi_connection)].clear()


def _on_close(dbapi_connection: Any, _record: Any) -> None:
    _pending_by_connection.pop(id(dbapi_connection), None)


def install() -> None:
    """Make SQLite read timezone-aware datetimes back as UTC. Idempotent; process-wide."""
    global _installed
    if not _installed:
        # pysqlite defines its own colspecs, and aiosqlite inherits from pysqlite.
        for dialect in (SQLiteDialect, SQLiteDialect_pysqlite):
            dialect.colspecs = {**dialect.colspecs, types.DateTime: UTCDateTime}
        _installed = True


def configure_engine(engine: AsyncEngine) -> None:
    """Install the datetime handling and register the connection setup on *engine*."""
    install()
    event.listen(engine.sync_engine, "connect", _on_connect)
    event.listen(engine.sync_engine, "commit", _on_commit)
    event.listen(engine.sync_engine, "rollback", _on_rollback)
    event.listen(engine.sync_engine, "close", _on_close)


_UNIQUE_FAILED = re.compile(r"UNIQUE constraint failed: (?P<columns>[\w.]+(?:, [\w.]+)*)")


def unique_constraint_name(message: str, metadata: MetaData) -> str | None:
    """Name the unique constraint or index behind a SQLite ``UNIQUE constraint failed`` message.

    SQLite reports the columns, not the constraint. The columns identify it in the model
    metadata (a primary key gets PostgreSQL's default ``<table>_pkey``), which is what the
    PostgreSQL driver reports directly and what the application branches on.
    """
    match = _UNIQUE_FAILED.search(message)
    if match is None:
        return None
    qualified = [column.split(".", 1) for column in match["columns"].split(", ")]
    table_name = qualified[0][0]
    columns = {column for _, column in qualified}
    table = metadata.tables.get(table_name)
    if table is None:
        return None
    for constraint in table.constraints:
        if {column.name for column in getattr(constraint, "columns", ())} != columns:
            continue
        if isinstance(constraint, PrimaryKeyConstraint):
            return constraint.name or f"{table_name}_pkey"
        if isinstance(constraint, UniqueConstraint) and constraint.name:
            return str(constraint.name)
    for index in table.indexes:
        if isinstance(index, Index) and index.unique and index.name and {c.name for c in index.columns} == columns:
            return str(index.name)
    return None


def prepare_metadata(metadata: MetaData) -> None:
    """Drop ``DEFERRABLE`` from constraints, which SQLite accepts only on foreign keys.

    Process-wide and one-way: call it only when the schema is being created on SQLite.
    """
    for table in metadata.tables.values():
        for constraint in table.constraints:
            if getattr(constraint, "deferrable", None):
                constraint.deferrable = None
                constraint.initially = None
