"""Alembic environment — sync psycopg3 for migrations, asyncpg for the app."""

import os
from logging.config import fileConfig

from sqlalchemy import create_engine
from sqlalchemy.engine import Connection
from sqlalchemy.engine.url import make_url

from alembic import context

# Import our models so Alembic can detect schema changes
from app.models import Base  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Allow DATABASE_URL env var to override alembic.ini.
# Replace the async driver with psycopg3 (sync) for migrations.
_raw_url = os.environ.get("DATABASE_URL") or config.get_main_option("sqlalchemy.url")
if _raw_url:
    _parsed = make_url(_raw_url)
    _sync_drivername = _parsed.drivername.replace("+asyncpg", "+psycopg")
    sync_url: str | None = _parsed.set(drivername=_sync_drivername).render_as_string(hide_password=False)
else:
    sync_url = None


def run_migrations_offline() -> None:
    context.configure(
        url=sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    if not sync_url:
        raise RuntimeError("No DATABASE_URL configured for migrations.")
    connectable = create_engine(sync_url)
    try:
        with connectable.connect() as conn:
            do_run_migrations(conn)
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
