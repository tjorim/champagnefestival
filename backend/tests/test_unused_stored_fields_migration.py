"""Migration 017 drops stored fields nothing uses and can be reversed (#1656)."""

import os
from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import create_engine, insert, inspect, text
from sqlalchemy.engine import make_url

from alembic import command
from app.models import Edition, Venue
from tests.helpers import requires_postgres

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")


def _columns(connection, table):
    return {column["name"] for column in inspect(connection).get_columns(table)}


def test_unused_fields_are_dropped_and_the_downgrade_restores_them(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    schema = f"test_unused_fields_{uuid4().hex}"
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
        command.upgrade(config, "016")
        with database.begin() as connection:
            connection.execute(insert(Venue).values(id="venue", name="Venue"))
            for edition_id, year, active in (("edition", 2026, True), ("other-edition", 2025, False)):
                connection.execute(
                    insert(Edition).values(id=edition_id, year=year, month="october", venue_id="venue", active=active)
                )
            # An odd legacy value: out-of-range visits that the API would have rejected, and one unset.
            for person_id, visits in (("regular", 3), ("odd", 99999), ("unset", None)):
                connection.execute(
                    text(
                        "INSERT INTO people (id, name, anonymised, visits_per_month) VALUES (:id, :id, false, :visits)"
                    ),
                    {"id": person_id, "visits": visits},
                )
            for subscription_id, categories, event_ids in (
                ("default", '["system_test"]', "[]"),
                ("odd", '{"not": "a list"}', '["gone-event"]'),
            ):
                connection.execute(
                    text(
                        "INSERT INTO push_subscriptions (id, endpoint, p256dh_key, auth_key, locale, categories, "
                        "event_ids) VALUES (:id, :endpoint, 'p256dh', 'auth', 'nl', CAST(:categories AS json), "
                        "CAST(:event_ids AS json))"
                    ),
                    {
                        "id": subscription_id,
                        "endpoint": f"https://push.example.com/{subscription_id}",
                        "categories": categories,
                        "event_ids": event_ids,
                    },
                )
            connection.execute(
                text(
                    "INSERT INTO edition_poll_questions (id, edition_id, kind, title_nl) "
                    "VALUES ('question', 'edition', 'meals', 'Maaltijden')"
                )
            )
            # The option's own edition disagrees with its question's: nothing used to keep them in step.
            for option_id, edition_id in (("agrees", "edition"), ("disagrees", "other-edition")):
                connection.execute(
                    text(
                        "INSERT INTO edition_poll_options (id, edition_id, question_id, label_nl, dietary_tags, "
                        "sort_order) VALUES (:id, :edition, 'question', 'Soep', '[]', 0)"
                    ),
                    {"id": option_id, "edition": edition_id},
                )

        command.upgrade(config, "017")

        with database.connect() as connection:
            assert "visits_per_month" not in _columns(connection, "people")
            assert {"categories", "event_ids"}.isdisjoint(_columns(connection, "push_subscriptions"))
            assert "edition_id" not in _columns(connection, "edition_poll_options")
            assert {"id", "label_nl", "question_id"} <= _columns(connection, "edition_poll_options")
            assert connection.execute(text("SELECT count(*) FROM people")).scalar_one() == 3
            assert connection.execute(text("SELECT count(*) FROM push_subscriptions")).scalar_one() == 2
            assert connection.execute(text("SELECT count(*) FROM edition_poll_options")).scalar_one() == 2
            index_columns = [index["column_names"] for index in inspect(connection).get_indexes("edition_poll_options")]
            assert ["edition_id"] not in index_columns

        command.downgrade(config, "016")

        with database.connect() as connection:
            visits = dict(connection.execute(text("SELECT id, visits_per_month FROM people")).all())
            assert visits == {"regular": None, "odd": None, "unset": None}
            for categories, event_ids in connection.execute(
                text("SELECT categories::text, event_ids::text FROM push_subscriptions")
            ):
                assert categories.replace(" ", "") == "[]"
                assert event_ids.replace(" ", "") == "[]"
            # Every option is rebuilt from its question, so the stale copy is repaired.
            restored = dict(connection.execute(text("SELECT id, edition_id FROM edition_poll_options")).all())
            assert restored == {"agrees": "edition", "disagrees": "edition"}
            index_columns = [index["column_names"] for index in inspect(connection).get_indexes("edition_poll_options")]
            assert ["edition_id"] in index_columns

        command.upgrade(config, "017")
        with database.connect() as connection:
            assert "edition_id" not in _columns(connection, "edition_poll_options")
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
