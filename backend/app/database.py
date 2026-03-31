"""Async SQLAlchemy engine and session factory."""

import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.database_url,
    # echo=True,  # uncomment for SQL query logging during development
)

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
