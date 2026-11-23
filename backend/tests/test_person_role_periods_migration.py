"""Migration 015 with real legacy PostgreSQL JSON, indexes and triggers."""

import json
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.models import Person
from tests.helpers import requires_postgres

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")


def test_person_role_period_backfill_and_email_invariant(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    schema = f"test_person_roles_{uuid4().hex}"
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)

    try:
        command.upgrade(config, "014")
        with database.begin() as connection:
            for person_id, email, roles, retired, history in (
                (
                    "legacy",
                    "legacy@example.com",
                    ["admin", " Membre ", False, "visitor", "treasurer"],
                    {},
                    {
                        "Bénévole": [False, {}, {"started_on": "2022-01-01", "ended_on": "2023-02-01"}],
                        "volunteer": [{"started_on": "invalid", "ended_on": None}],
                        "member": [{"started_on": "2099-01-01", "ended_on": "invalid"}],
                    },
                ),
                ("current", " SHARED@Example.com ", ["member"], {}, {}),
                ("alias", "shared@example.com", ["lid"], {}, {}),
                ("retired", "shared@example.com", ["VRIJWILLIGER"], {"volunteer": "2024-01-01"}, "broken"),
                (
                    "removed",
                    "",
                    None,
                    [],
                    {
                        "member": [{"started_on": None, "ended_on": "2025-01-01"}],
                        "admin": [{"started_on": "2022-05-06", "ended_on": None}],
                    },
                ),
                ("shape", "", {"member": True}, [], {"volunteer": "unexpected"}),
                ("bad-date", "", ["lid"], {"lid": "\x00"}, {}),
            ):
                connection.execute(
                    text("""
                        INSERT INTO people (id, name, email, roles, retired_roles, role_history, anonymised)
                        VALUES (:id, :id, :email, CAST(:roles AS json), CAST(:retired AS json), CAST(:history AS json), false)
                    """),
                    {
                        "id": person_id,
                        "email": email,
                        "roles": json.dumps(roles),
                        "retired": json.dumps(retired),
                        "history": json.dumps(history),
                    },
                )

        command.upgrade(config, "015")

        with Session(database) as session:
            migration_day = session.execute(text("SELECT CURRENT_DATE")).scalar_one().isoformat()
            legacy = session.get_one(Person, "legacy")
            assert legacy.roles == ["member", "volunteer"]
            assert legacy.retired_roles == {}
            assert legacy.role_history == {
                "member": [{"started_on": None, "ended_on": None}],
                "volunteer": [
                    {"started_on": "2022-01-01", "ended_on": "2023-02-01"},
                    {"started_on": None, "ended_on": None},
                ],
            }
            assert session.get_one(Person, "current").retired_roles == {}
            assert session.get_one(Person, "alias").retired_roles == {"member": migration_day}
            assert session.get_one(Person, "retired").retired_roles == {"volunteer": "2024-01-01"}
            removed = session.get_one(Person, "removed")
            assert removed.roles == []
            assert removed.role_history == {"member": [{"started_on": None, "ended_on": "2025-01-01"}]}
            assert session.get_one(Person, "shape").role_history == {}
            assert session.get_one(Person, "bad-date").retired_roles == {"member": migration_day}

        assert {"roles", "retired_roles", "role_history"}.isdisjoint(
            column["name"] for column in inspect(database).get_columns("people")
        )
        with database.begin() as connection:
            for statement, constraint in (
                (
                    "UPDATE people SET email = 'Shared@example.com' WHERE id = 'legacy'",
                    "uq_people_current_member_email",
                ),
                (
                    "INSERT INTO person_role_periods (person_id, role, position) VALUES ('alias', 'member', 1)",
                    "uq_people_current_member_email",
                ),
                (
                    "INSERT INTO person_role_periods (person_id, role, position) VALUES ('legacy', 'volunteer', 2)",
                    "uq_person_role_periods_open",
                ),
                (
                    "INSERT INTO person_role_periods (person_id, role, position) VALUES ('legacy', 'admin', 0)",
                    "ck_person_role_periods_role",
                ),
            ):
                with pytest.raises(IntegrityError, match=constraint), connection.begin_nested():
                    connection.execute(text(statement))

            connection.execute(text("UPDATE people SET anonymised = true WHERE id = 'current'"))
            connection.execute(
                text("INSERT INTO person_role_periods (person_id, role, position) VALUES ('alias', 'member', 1)")
            )

        command.downgrade(config, "014")
        with database.connect() as connection:
            assert connection.execute(text("SELECT roles FROM people WHERE id = 'alias'")).scalar_one() == ["member"]
            assert connection.execute(text("SELECT roles FROM people WHERE id = 'removed'")).scalar_one() == []
        command.upgrade(config, "015")
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
