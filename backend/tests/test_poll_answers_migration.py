"""Migration 019 moves every volunteer poll answer into one discriminated table and can be reversed (#1662)."""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, insert, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from alembic import command
from app.models import Edition, Venue
from tests.helpers import requires_postgres

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")

QUESTIONS = (
    ("q-yes-no", "yes_no"),
    ("q-choice", "single_choice"),
    ("q-text", "free_text"),
    ("q-rating", "rating"),
    ("q-meals", "meals"),
)


def _rows(connection, table, columns):
    return sorted(connection.execute(text(f"SELECT {columns} FROM {table}")).all())


def test_answers_move_into_one_table_and_back(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    schema = f"test_poll_answers_{uuid4().hex}"
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
        command.upgrade(config, "018")
        with database.begin() as connection:
            connection.execute(insert(Venue).values(id="venue", name="Venue"))
            connection.execute(insert(Edition).values(id="edition", year=2026, month="october", venue_id="venue"))
            for person in ("anna", "ben", "cleo"):
                connection.execute(
                    text("INSERT INTO people (id, name, anonymised) VALUES (:id, :id, false)"), {"id": person}
                )
            for question_id, kind in QUESTIONS:
                connection.execute(
                    text(
                        "INSERT INTO edition_poll_questions (id, edition_id, kind, title_nl) "
                        "VALUES (:id, 'edition', :kind, 'Vraag')"
                    ),
                    {"id": question_id, "kind": kind},
                )
            for option_id, question_id in (("soup", "q-meals"), ("fish", "q-choice"), ("meat", "q-choice")):
                connection.execute(
                    text(
                        "INSERT INTO edition_poll_options (id, question_id, label_nl, dietary_tags, sort_order) "
                        "VALUES (:id, :question, 'Optie', '[]', 0)"
                    ),
                    {"id": option_id, "question": question_id},
                )
            connection.execute(
                text(
                    "INSERT INTO volunteer_poll_answers (volunteer_id, question_id, attending, people) VALUES "
                    "('anna', 'q-yes-no', true, 3), ('ben', 'q-yes-no', false, 0), "
                    # Odd legacy: an attendance row on a question that is not yes/no.
                    "('cleo', 'q-rating', true, 1)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO volunteer_poll_choices VALUES ('anna', 'q-choice', 'fish'), ('ben', 'q-choice', 'meat')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO volunteer_poll_texts VALUES ('anna', 'q-text', 'Geen noten'), "
                    "('ben', 'q-text', '  allergisch  '), "
                    # Odd legacy: a text answer on a question of another kind.
                    "('cleo', 'q-yes-no', 'verkeerd')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO volunteer_poll_ratings VALUES ('anna', 'q-rating', 5), ('ben', 'q-rating', 1), "
                    "('cleo', 'q-choice', 4)"
                )
            )
            connection.execute(text("INSERT INTO volunteer_poll_selections VALUES ('anna', 'soup', 2, now())"))

        command.upgrade(config, "019")

        with database.begin() as connection:
            assert _rows(
                connection,
                "volunteer_poll_answers",
                "volunteer_id, question_id, kind, attending, people, option_id, text, rating",
            ) == [
                ("anna", "q-choice", "single_choice", None, None, "fish", None, None),
                ("anna", "q-rating", "rating", None, None, None, None, 5),
                ("anna", "q-text", "free_text", None, None, None, "Geen noten", None),
                ("anna", "q-yes-no", "yes_no", True, 3, None, None, None),
                ("ben", "q-choice", "single_choice", None, None, "meat", None, None),
                ("ben", "q-rating", "rating", None, None, None, None, 1),
                ("ben", "q-text", "free_text", None, None, None, "  allergisch  ", None),
                ("ben", "q-yes-no", "yes_no", False, 0, None, None, None),
            ]
            assert _rows(connection, "volunteer_poll_selections", "volunteer_id, option_id, quantity") == [
                ("anna", "soup", 2)
            ]
        tables = set(inspect(database).get_table_names())
        assert {"volunteer_poll_choices", "volunteer_poll_texts", "volunteer_poll_ratings"}.isdisjoint(tables)
        columns = {column["name"]: column for column in inspect(database).get_columns("volunteer_poll_answers")}
        assert columns["attending"]["nullable"] and columns["people"]["nullable"]
        assert not columns["kind"]["nullable"]

        def rejected(statement):
            with pytest.raises(IntegrityError), database.begin() as connection:
                connection.execute(text(statement))

        # More than one value, none, or one that does not fit the kind.
        rejected("UPDATE volunteer_poll_answers SET rating = 3 WHERE question_id = 'q-text'")
        rejected("UPDATE volunteer_poll_answers SET text = NULL WHERE question_id = 'q-text'")
        rejected("UPDATE volunteer_poll_answers SET text = '  ' WHERE volunteer_id = 'anna' AND question_id = 'q-text'")
        rejected(
            "UPDATE volunteer_poll_answers SET rating = 6 WHERE volunteer_id = 'anna' AND question_id = 'q-rating'"
        )
        rejected(
            "UPDATE volunteer_poll_answers SET rating = 0 WHERE volunteer_id = 'anna' AND question_id = 'q-rating'"
        )
        rejected(
            "UPDATE volunteer_poll_answers SET people = 0 WHERE volunteer_id = 'anna' AND question_id = 'q-yes-no'"
        )
        rejected(
            "UPDATE volunteer_poll_answers SET people = 11 WHERE volunteer_id = 'anna' AND question_id = 'q-yes-no'"
        )
        # The kind follows the question, and the option stays inside its question.
        rejected("UPDATE volunteer_poll_answers SET kind = 'rating' WHERE question_id = 'q-text'")
        rejected("UPDATE volunteer_poll_answers SET option_id = 'soup' WHERE question_id = 'q-choice'")
        rejected("UPDATE volunteer_poll_answers SET option_id = 'ghost' WHERE question_id = 'q-choice'")
        rejected(
            "INSERT INTO volunteer_poll_answers (volunteer_id, question_id, kind, rating) "
            "VALUES ('cleo', 'q-yes-no', 'rating', 3)"
        )
        rejected(
            "INSERT INTO volunteer_poll_answers (volunteer_id, question_id, kind) VALUES ('cleo', 'q-text', 'free_text')"
        )

        # Deleting an option or a question removes its answers.
        with database.begin() as connection:
            connection.execute(text("DELETE FROM edition_poll_options WHERE id = 'fish'"))
            connection.execute(text("DELETE FROM edition_poll_questions WHERE id = 'q-rating'"))
            remaining = connection.execute(
                text("SELECT question_id, count(*) FROM volunteer_poll_answers GROUP BY question_id ORDER BY 1")
            ).all()
            assert remaining == [("q-choice", 1), ("q-text", 2), ("q-yes-no", 2)]

        command.downgrade(config, "018")
        with database.begin() as connection:
            assert _rows(connection, "volunteer_poll_answers", "volunteer_id, question_id, attending, people") == [
                ("anna", "q-yes-no", True, 3),
                ("ben", "q-yes-no", False, 0),
            ]
            assert _rows(connection, "volunteer_poll_choices", "volunteer_id, question_id, option_id") == [
                ("ben", "q-choice", "meat")
            ]
            assert _rows(connection, "volunteer_poll_texts", "volunteer_id, question_id, text") == [
                ("anna", "q-text", "Geen noten"),
                ("ben", "q-text", "  allergisch  "),
            ]
            assert _rows(connection, "volunteer_poll_ratings", "volunteer_id, question_id, rating") == []
        columns = {column["name"]: column for column in inspect(database).get_columns("volunteer_poll_answers")}
        assert set(columns) == {"volunteer_id", "question_id", "attending", "people", "updated_at"}
        assert not columns["attending"]["nullable"] and not columns["people"]["nullable"]
        with pytest.raises(IntegrityError, match="ck_volunteer_poll_answers_people"), database.begin() as connection:
            connection.execute(text("UPDATE volunteer_poll_answers SET people = 0 WHERE volunteer_id = 'anna'"))

        # The round trip lands in the same place.
        command.upgrade(config, "019")
        with database.begin() as connection:
            assert connection.execute(text("SELECT count(*) FROM volunteer_poll_answers")).scalar_one() == 5
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
