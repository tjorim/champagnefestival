"""Migration 007: editions gain sponsor tiers and keep their lineup order (#1226)."""

import os
from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from alembic import command


def test_existing_lineups_keep_their_order_and_start_untiered(monkeypatch):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_sponsor_tiers_migration_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)
    try:
        command.upgrade(config, "006")
        with database.begin() as connection:
            connection.execute(text("INSERT INTO venues (id, name) VALUES ('venue', 'Venue')"))
            connection.execute(
                text(
                    "INSERT INTO editions (id, year, month, venue_id, organizations) "
                    "VALUES ('edition', 2026, 'October', 'venue', CAST(:lineup AS json))"
                ),
                {"lineup": "[9, 3, 7, 1]"},
            )

        command.upgrade(config, "007")
        with database.begin() as connection:
            row = connection.execute(text("SELECT organizations, sponsor_tiers FROM editions")).one()
        assert row.organizations == [9, 3, 7, 1]
        assert row.sponsor_tiers == {}

        command.downgrade(config, "006")
        with database.begin() as connection:
            columns = connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = current_schema() AND table_name = 'editions'"
                )
            ).scalars()
            assert "sponsor_tiers" not in set(columns)
            assert connection.execute(text("SELECT organizations FROM editions")).scalar_one() == [9, 3, 7, 1]
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
