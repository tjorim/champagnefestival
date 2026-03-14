"""Alembic environment — async SQLAlchemy."""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

# Import our models so Alembic can detect schema changes
from app.models import Base  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Allow DATABASE_URL env var to override alembic.ini
database_url = os.environ.get("DATABASE_URL") or config.get_main_option("sqlalchemy.url")

# Alembic uses sync by default; we adapt to async here.
# The URL stored in alembic.ini is the *sync* SQLite URL; swap to async driver.
if database_url and database_url.startswith("sqlite:///") and "aiosqlite" not in database_url:
    async_url = database_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
else:
    async_url = database_url


def run_migrations_offline() -> None:
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = create_async_engine(async_url)
    async with connectable.connect() as conn:
        await conn.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
