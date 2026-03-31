"""Alembic environment — sync psycopg3 for migrations, asyncpg for the app."""

import os
from logging.config import fileConfig

from sqlalchemy import create_engine
from sqlalchemy.engine import Connection

from alembic import context

# Import our models so Alembic can detect schema changes
from app.models import Base  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Allow DATABASE_URL env var to override alembic.ini.
# Strip the async driver prefix so psycopg3 (sync) is used for migrations.
database_url = os.environ.get("DATABASE_URL") or config.get_main_option("sqlalchemy.url")
sync_url = database_url.replace("+asyncpg", "+psycopg") if database_url else None


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
    with connectable.connect() as conn:
        do_run_migrations(conn)
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
