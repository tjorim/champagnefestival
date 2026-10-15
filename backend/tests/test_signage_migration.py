"""Migration 009 upgrades existing databases and downgrades without touching editions."""

import os
from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from alembic import command


def test_signage_upgrade_and_downgrade(monkeypatch):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_signage_migration_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)
    try:
        command.upgrade(config, "008")
        with database.begin() as connection:
            connection.execute(text("INSERT INTO venues (id, name) VALUES ('venue', 'Venue')"))
            connection.execute(
                text(
                    "INSERT INTO editions (id, year, month, venue_id, sponsor_tiers) VALUES ('edition', 2026, 'October', 'venue', '{}')"
                )
            )
        command.upgrade(config, "head")
        with database.begin() as connection:
            tables = inspect(connection).get_table_names(schema=schema)
            assert {"signage_channels", "signage_slides", "signage_templates"} <= set(tables)
            connection.execute(
                text(
                    "INSERT INTO signage_channels (id, slug, name, edition_id, active, epoch, revision) VALUES ('hall', 'hall', 'Hall', 'edition', true, now(), 1)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO signage_templates (id, name, background, layers) VALUES ('template', 'Template', '{}', '[]')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO signage_slides (id, channel_id, template_id, sort_order, kind, duration, active, content) VALUES ('slide', 'hall', 'template', 0, 'notice', 10, true, '{}')"
                )
            )
        command.downgrade(config, "008")
        with database.begin() as connection:
            assert not any(name.startswith("signage_") for name in inspect(connection).get_table_names(schema=schema))
            assert connection.execute(text("SELECT id FROM editions")).scalar_one() == "edition"
        command.upgrade(config, "head")
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
