"""Migration 010 preserves people, enforces member uniqueness and adds the event gate."""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from alembic import command
from tests.helpers import requires_postgres

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")


def test_member_overview_migration(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_members_{uuid4().hex}"
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        conn.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)
    try:
        command.upgrade(config, "009")
        with database.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO people (id, name, email, roles, retired_roles, role_history, anonymised) VALUES ('existing', 'Existing', 'member@example.com', '[\"member\"]', '{}', '{}', false)"
                )
            )
        command.upgrade(config, "010")
        with database.begin() as conn:
            row = conn.execute(
                text("SELECT inactivity_exempt, inactivity_exempt_note FROM people WHERE id = 'existing'")
            ).one()
            assert row == (False, "")
            column = conn.execute(
                text(
                    "SELECT is_nullable, column_default FROM information_schema.columns "
                    "WHERE table_schema = :schema AND table_name = 'events' AND column_name = 'members_only'"
                ),
                {"schema": schema},
            ).one()
            assert column == ("NO", "false")
            conn.execute(
                text(
                    "INSERT INTO people (id, name, email, roles, retired_roles, role_history, anonymised) VALUES ('retired', 'Retired', 'MEMBER@example.com', '[\"member\"]', '{\"member\": \"2026-10-01\"}', '{}', false)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO people (id, name, email, roles, retired_roles, role_history, anonymised) VALUES ('guest', 'Guest', 'MEMBER@example.com', '[]', '{}', '{}', false)"
                )
            )
        with pytest.raises(IntegrityError), database.begin() as conn:
            conn.execute(text("UPDATE people SET retired_roles = '{}' WHERE id = 'retired'"))
        command.downgrade(config, "009")
        with database.begin() as conn:
            assert conn.execute(text("SELECT count(*) FROM people")).scalar_one() == 3
            assert (
                conn.execute(
                    text(
                        "SELECT count(*) FROM information_schema.columns "
                        "WHERE table_schema = :schema AND table_name = 'events' AND column_name = 'members_only'"
                    ),
                    {"schema": schema},
                ).scalar_one()
                == 0
            )
        command.upgrade(config, "010")
        command.upgrade(config, "head")
        # Reflection must agree with the model's expression-index SQL as well
        # as enforce the uniqueness behavior checked above.
        command.check(config)
    finally:
        database.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
