"""Migration 009 preserves orders and enforces typed answer constraints."""

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
from app.models import Edition, Event, Person, Registration, Venue


def test_order_question_upgrade_constraints_and_downgrade(monkeypatch):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_order_questions_{uuid4().hex}"
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
        with Session(database) as db:
            from datetime import date

            db.add(Venue(id="venue", name="Venue"))
            db.flush()
            db.add(Edition(id="edition", year=2026, month="october", venue_id="venue"))
            db.add(Person(id="person", name="Visitor"))
            db.flush()
            db.add(
                Event(
                    id="event",
                    edition_id="edition",
                    title_nl="Festival",
                    date=date(2026, 10, 24),
                    start_time="18:00",
                    category="general",
                )
            )
            db.flush()
            db.add(
                Registration(id="order", event_id="event", person_id="person", guest_count=1, check_in_token="token")
            )
            db.commit()
        with database.begin() as conn:
            for qid, kind in [
                ("choice", "single_choice"),
                ("other", "single_choice"),
                ("text", "free_text"),
                ("score", "rating"),
            ]:
                conn.execute(
                    text(
                        "INSERT INTO event_order_questions (id,event_id,kind,title_nl,active,sort_order) VALUES (:id,'event',:kind,'Vraag',true,0)"
                    ),
                    {"id": qid, "kind": kind},
                )
            conn.execute(
                text(
                    "INSERT INTO event_order_options (id,question_id,label_nl,sort_order) VALUES ('bike','choice','Fiets',0),('wrong','other','Bus',0)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO registration_order_answers (registration_id,question_id,kind,option_id) VALUES ('order','choice','single_choice','bike')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO registration_order_answers (registration_id,question_id,kind,text) VALUES ('order','text','free_text','Tekst')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO registration_order_answers (registration_id,question_id,kind,rating) VALUES ('order','score','rating',5)"
                )
            )
        for sql in [
            "UPDATE registration_order_answers SET rating=6 WHERE question_id='score'",
            "UPDATE registration_order_answers SET text='mixed' WHERE question_id='score'",
            "UPDATE registration_order_answers SET text='  ' WHERE question_id='text'",
            "UPDATE registration_order_answers SET option_id='wrong' WHERE question_id='choice'",
            "UPDATE registration_order_answers SET kind='rating', option_id=NULL, rating=3 WHERE question_id='choice'",
            "DELETE FROM event_order_questions WHERE id='score'",
        ]:
            with pytest.raises(IntegrityError), database.begin() as conn:
                conn.execute(text(sql))
        command.downgrade(config, "008")
        assert "registration_order_answers" not in inspect(database).get_table_names(schema=schema)
        with database.begin() as conn:
            assert conn.execute(text("SELECT id FROM registrations")).scalar_one() == "order"
        command.upgrade(config, "009")
    finally:
        database.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
