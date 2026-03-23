"""Async SQLAlchemy engine and session factory."""

import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)

_is_sqlite = settings.database_url.startswith("sqlite")

if _is_sqlite:
    _db_path = make_url(settings.database_url).database or ""
    if _db_path and _db_path != ":memory:":
        _parent = Path(_db_path).parent
        try:
            _parent.mkdir(parents=True, exist_ok=True)
            logger.info(f"✓ SQLite data directory ready: {_parent}")
        except (PermissionError, OSError) as e:
            raise RuntimeError(f"Cannot create SQLite data directory {_parent}: {e}") from e

engine = create_async_engine(
    settings.database_url,
    # echo=True,  # uncomment for SQL query logging during development
    **({"connect_args": {"check_same_thread": False}} if _is_sqlite else {}),
)

if _is_sqlite:

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record) -> None:  # noqa: ANN001
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")  # milliseconds to wait before returning SQLITE_BUSY
        cursor.close()


async_session_factory = async_sessionmaker(
    engine,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session."""
    async with async_session_factory() as session:
        yield session


async def create_tables() -> None:
    """Create all tables on startup (used when Alembic is not run yet)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
