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

from app.config import settings
from app.operational_search_schema import OPERATIONAL_SEARCH_SCHEMA_STATEMENTS
from app.payment_ledger_schema import PAYMENT_LEDGER_SCHEMA_STATEMENTS

logger = logging.getLogger(__name__)

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
    return getattr(exc.driver_exception, "constraint_name", None)


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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for statement in OPERATIONAL_SEARCH_SCHEMA_STATEMENTS:
            await conn.execute(text(statement))
        for statement in PAYMENT_LEDGER_SCHEMA_STATEMENTS:
            await conn.execute(text(statement))
