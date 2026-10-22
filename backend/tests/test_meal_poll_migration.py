"""Migration 009 (part 2): meal poll options get translated labels, an order, dietary tags and a closing time."""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from alembic import command
from tests.helpers import requires_postgres

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")


def test_existing_options_keep_their_label_and_creation_order(monkeypatch):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_meal_poll_migration_{uuid4().hex}"
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
            for edition in ("edition-a", "edition-b"):
                connection.execute(
                    text(
                        "INSERT INTO editions (id, year, month, venue_id, sponsor_tiers, active) "
                        "VALUES (:id, 2026, 'October', 'venue', '{}', false)"
                    ),
                    {"id": edition},
                )
            for option_id, edition, label, created in (
                ("late", "edition-a", "Soep", "2026-01-02T00:00:00+00"),
                ("early", "edition-a", "Stoofvlees", "2026-01-01T00:00:00+00"),
                ("other", "edition-b", "Dessert", "2026-01-03T00:00:00+00"),
            ):
                connection.execute(
                    text(
                        "INSERT INTO edition_poll_options (id, edition_id, label, created_at, updated_at) "
                        "VALUES (:id, :edition, :label, :created, :created)"
                    ),
                    {"id": option_id, "edition": edition, "label": label, "created": created},
                )

        command.upgrade(config, "009")
        with database.begin() as connection:
            rows = {
                row.id: row
                for row in connection.execute(
                    text("SELECT id, label_nl, label_fr, label_en, dietary_tags, sort_order FROM edition_poll_options")
                )
            }
            assert (rows["early"].label_nl, rows["early"].sort_order) == ("Stoofvlees", 0)
            assert (rows["late"].label_nl, rows["late"].sort_order) == ("Soep", 1)
            assert rows["other"].sort_order == 0  # numbered per edition
            assert (rows["early"].label_fr, rows["early"].label_en, rows["early"].dietary_tags) == (None, None, [])
            # Every existing option moved into one "meals" question per edition.
            questions = {
                row.edition_id: row
                for row in connection.execute(
                    text(
                        "SELECT id, edition_id, kind, title_nl, title_fr, title_en, closes_at FROM edition_poll_questions"
                    )
                )
            }
            assert set(questions) == {"edition-a", "edition-b"}
            assert {(q.kind, q.title_nl, q.title_fr, q.title_en, q.closes_at) for q in questions.values()} == {
                ("meals", "Maaltijden", "Repas", "Meals", None)
            }
            owners = dict(connection.execute(text("SELECT id, question_id FROM edition_poll_options")).all())
            assert owners == {
                "early": questions["edition-a"].id,
                "late": questions["edition-a"].id,
                "other": questions["edition-b"].id,
            }
            connection.execute(
                text(
                    "INSERT INTO people (id, name, retired_roles, role_history, anonymised, created_at, updated_at) VALUES ('per', 'Sofie', '{}', '{}', false, now(), now())"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO edition_poll_questions (id, edition_id, kind, title_nl) VALUES ('q-yes-no', 'edition-a', 'yes_no', 'Eten?')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO volunteer_poll_answers (volunteer_id, question_id, attending, people) VALUES ('per', 'q-yes-no', true, 2)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO volunteer_meal_notes (volunteer_id, edition_id, note) VALUES ('per', 'edition-a', 'x')"
                )
            )
        assert "label" not in {c["name"] for c in inspect(database).get_columns("edition_poll_options", schema=schema)}
        with pytest.raises(IntegrityError, match="ck_edition_poll_options_label_nl"), database.begin() as connection:
            connection.execute(text("UPDATE edition_poll_options SET label_nl = '  ' WHERE id = 'early'"))
        with pytest.raises(IntegrityError, match="ck_volunteer_poll_answers_people"), database.begin() as connection:
            connection.execute(text("UPDATE volunteer_poll_answers SET people = 0 WHERE question_id = 'q-yes-no'"))
        with pytest.raises(IntegrityError, match="ck_edition_poll_questions_kind"), database.begin() as connection:
            connection.execute(text("UPDATE edition_poll_questions SET kind = 'survey' WHERE id = 'q-yes-no'"))

        command.downgrade(config, "008")
        with database.begin() as connection:
            assert connection.execute(
                text("SELECT label FROM edition_poll_options WHERE id = 'early'")
            ).scalar_one() == ("Stoofvlees")
        tables = inspect(database).get_table_names(schema=schema)
        assert {"volunteer_meal_notes", "volunteer_poll_answers", "edition_poll_questions"}.isdisjoint(tables)
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
