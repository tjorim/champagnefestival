"""Migration 011: relational edition lineup and status CHECK constraints."""

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


def test_lineup_moves_to_a_join_table_and_back(monkeypatch):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_domain_integrity_migration_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)
    try:
        command.upgrade(config, "010")
        with database.begin() as connection:
            connection.execute(text("INSERT INTO venues (id, name) VALUES ('venue', 'Venue')"))
            for organization_id, kind in ((1, "producer"), (2, "sponsor"), (3, "sponsor")):
                connection.execute(
                    text("INSERT INTO organizations (id, name, type) VALUES (:id, 'Org', :kind)"),
                    {"id": organization_id, "kind": kind},
                )
            connection.execute(
                text(
                    "INSERT INTO editions (id, year, month, venue_id, organizations, sponsor_tiers) "
                    "VALUES ('edition', 2026, 'October', 'venue', CAST(:lineup AS json), CAST(:tiers AS json))"
                ),
                # 99 has no organization row; the copy drops it instead of failing.
                {"lineup": "[3, 99, 1, 2]", "tiers": '{"2": "main", "3": "partner"}'},
            )

        command.upgrade(config, "011")
        with database.begin() as connection:
            rows = connection.execute(
                text(
                    "SELECT organization_id, position, sponsor_tier FROM edition_organizations "
                    "WHERE edition_id = 'edition' ORDER BY position"
                )
            ).all()
        assert [tuple(row) for row in rows] == [(3, 0, "partner"), (1, 1, None), (2, 2, "main")]

        with pytest.raises(IntegrityError), database.begin() as connection:
            connection.execute(text("UPDATE edition_organizations SET sponsor_tier = 'x'"))
        with database.begin() as connection:
            names = set(
                connection.execute(
                    text(
                        "SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = current_schema()::regnamespace"
                    )
                ).scalars()
            )
        assert {
            "ck_registrations_status",
            "ck_registrations_payment_status",
            "ck_editions_edition_type",
        } <= names

        command.downgrade(config, "010")
        with database.begin() as connection:
            row = connection.execute(text("SELECT organizations, sponsor_tiers FROM editions")).one()
        assert row.organizations == [3, 1, 2]
        assert row.sponsor_tiers == {"2": "main", "3": "partner"}
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
