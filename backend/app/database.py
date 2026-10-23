"""Async SQLAlchemy engine and session factory."""

import logging
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app import sqlite_compat
from app.config import settings
from app.operational_search_schema import OPERATIONAL_SEARCH_SCHEMA_STATEMENTS, OPERATIONAL_SEARCH_SQLITE_STATEMENTS
from app.payment_ledger_schema import PAYMENT_LEDGER_SCHEMA_STATEMENTS

logger = logging.getLogger(__name__)

if settings.database_url.startswith("sqlite"):
    # Local development only; production is PostgreSQL. SQLite pools take no size, and a
    # writer waits up to 30 s for the single write lock instead of failing at once.
    engine = create_async_engine(settings.database_url, connect_args={"timeout": 30})
    sqlite_compat.configure_engine(engine)
else:
    engine = create_async_engine(
        settings.database_url,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_pool_max_overflow,
        # echo=True,  # uncomment for SQL query logging during development
    )


def violated_constraint_name(exc: DBAPIError) -> str | None:
    """Name of the constraint behind an integrity error, as reported by the driver.

    SQLAlchemy 2.1's asyncpg dialect wraps the driver error in an emulated DBAPI
    exception that doesn't carry ``constraint_name``; ``driver_exception`` is the
    supported accessor for the real ``asyncpg`` error.
    """
    name = getattr(exc.driver_exception, "constraint_name", None)
    if name is None and engine.dialect.name == "sqlite":
        return sqlite_compat.unique_constraint_name(str(exc.orig), Base.metadata)
    return name


async_session_factory = async_sessionmaker(
    engine,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency that yields a database session."""
    async with async_session_factory() as session:
        yield session


async def create_tables() -> None:
    """Create all tables on startup (used when Alembic is not run yet)."""
    sqlite = engine.dialect.name == "sqlite"
    if sqlite:
        sqlite_compat.prepare_metadata(Base.metadata)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if sqlite:
            # The search triggers have a SQLite twin; the trigram indexes and the append-only payment
            # ledger triggers are PostgreSQL features.
            for statement in OPERATIONAL_SEARCH_SQLITE_STATEMENTS:
                await conn.execute(text(statement))
            return
        for statement in OPERATIONAL_SEARCH_SCHEMA_STATEMENTS:
            await conn.execute(text(statement))
        for statement in PAYMENT_LEDGER_SCHEMA_STATEMENTS:
            await conn.execute(text(statement))
