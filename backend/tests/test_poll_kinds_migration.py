"""Migration 009 preserves old answers and constrains the new typed storage."""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DataError, IntegrityError

from alembic import command
from tests.helpers import requires_postgres

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")


def test_upgrade_constraints_and_downgrade(monkeypatch):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_poll_kinds_{uuid4().hex}"
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
            conn.execute(text("INSERT INTO venues (id,name) VALUES ('v','Venue')"))
            conn.execute(
                text(
                    "INSERT INTO editions (id,year,month,venue_id,sponsor_tiers,active) VALUES ('e',2026,'October','v','{}',false)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO people (id,name,retired_roles,role_history,anonymised) VALUES ('p','Volunteer','{}','{}',false)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO edition_poll_questions (id,edition_id,kind,title_nl) VALUES ('old','e','yes_no','Oud')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO volunteer_poll_answers (volunteer_id,question_id,attending,people) VALUES ('p','old',true,2)"
                )
            )
        with database.begin() as conn:
            for kind in ("single_choice", "free_text", "rating"):
                conn.execute(
                    text(
                        "INSERT INTO edition_poll_questions (id,edition_id,kind,title_nl) VALUES (:kind,'e',:kind,'Vraag')"
                    ),
                    {"kind": kind},
                )
            conn.execute(
                text(
                    "INSERT INTO edition_poll_options (id,edition_id,question_id,label_nl,dietary_tags,sort_order) VALUES ('o','e','single_choice','Optie','[]',0),('wrong','e','old','Elders','[]',0)"
                )
            )
            conn.execute(text("INSERT INTO volunteer_poll_choices VALUES ('p','single_choice','o')"))
            conn.execute(text("INSERT INTO volunteer_poll_texts VALUES ('p','free_text','Tekst')"))
            conn.execute(text("INSERT INTO volunteer_poll_ratings VALUES ('p','rating',5)"))
        for statement in (
            "UPDATE volunteer_poll_ratings SET rating=0",
            "UPDATE volunteer_poll_ratings SET rating=6",
            "UPDATE volunteer_poll_texts SET text='  '",
            "UPDATE volunteer_poll_texts SET text=repeat('x',501)",
            "UPDATE volunteer_poll_choices SET option_id='wrong'",
            "UPDATE volunteer_poll_choices SET volunteer_id='missing'",
            "INSERT INTO volunteer_poll_ratings VALUES ('p','rating',3)",
            "UPDATE edition_poll_questions SET kind='unknown' WHERE id='rating'",
        ):
            with pytest.raises((IntegrityError, DataError)), database.begin() as conn:
                conn.execute(text(statement))
        with database.begin() as conn:
            conn.execute(text("DELETE FROM edition_poll_options WHERE id='o'"))
            assert conn.execute(text("SELECT count(*) FROM volunteer_poll_choices")).scalar_one() == 0
        with database.begin() as conn:
            assert (
                conn.execute(text("SELECT people FROM volunteer_poll_answers WHERE question_id='old'")).scalar_one()
                == 2
            )
        command.downgrade(config, "008")
        assert not {"volunteer_poll_choices", "volunteer_poll_texts", "volunteer_poll_ratings"} & set(
            inspect(database).get_table_names(schema=schema)
        )
        with database.begin() as conn:
            assert conn.execute(text("SELECT name FROM people WHERE id='p'")).scalar_one() == "Volunteer"
        command.upgrade(config, "009")
    finally:
        database.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
