"""Migration 012 upgrades existing schema values and keeps operational search working."""

import os
from datetime import time
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


def test_schema_values_round_trip(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    schema = f"test_schema_values_{uuid4().hex}"
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
        command.upgrade(config, "011")
        with database.begin() as connection:
            connection.execute(text("INSERT INTO venues (id, name) VALUES ('venue', 'Venue')"))
            connection.execute(text("INSERT INTO venues (id, name, lat, lng) VALUES ('equator', 'Equator', 0, 4)"))
            connection.execute(
                text("INSERT INTO editions (id, year, month, venue_id) VALUES ('edition', 2026, ' Octobre ', 'venue')")
            )
            connection.execute(
                text(
                    "INSERT INTO events (id, edition_id, title_nl, date, start_time, end_time, category) "
                    "VALUES ('event', 'edition', 'Evenement', '2026-10-01', '9:15', '', 'tasting')"
                )
            )
            connection.execute(
                text("INSERT INTO app_settings (id, public_phone) VALUES ('app_settings', '+320000000')")
            )
            connection.execute(
                text(
                    "INSERT INTO stamp_card_types (id, name_nl, box_count, reward_label_nl, active) "
                    "VALUES ('stamp', 'Kaart', 2, 'Beloning', true)"
                )
            )

        command.upgrade(config, "012")
        with database.begin() as connection:
            assert connection.scalar(text("SELECT month FROM editions")) == "october"
            assert tuple(connection.execute(text("SELECT start_time, end_time FROM events")).one()) == (
                time(9, 15),
                None,
            )
            assert [tuple(row) for row in connection.execute(text("SELECT lat, lng FROM venues ORDER BY id"))] == [
                (0, 4),
                (None, None),
            ]
            assert tuple(connection.execute(text("SELECT public_email, public_phone FROM app_settings")).one()) == (
                None,
                "+320000000",
            )
            assert connection.scalar(text("SELECT created_at = updated_at FROM stamp_card_types"))
            columns = {col["name"]: col for col in inspect(connection).get_columns("events")}
            assert columns["title_nl"]["nullable"] is False

            email = "A" * 210 + "@example.test"
            assert (
                connection.scalar(
                    text(
                        "INSERT INTO people (id, name, email, retired_roles, role_history, anonymised) "
                        "VALUES ('person', 'Person', :email, '{}', '{}', false) RETURNING search_email"
                    ),
                    {"email": email},
                )
                == email.lower()
            )
        for sql in (
            "UPDATE editions SET month = 'unknown'",
            "UPDATE events SET start_time = '13:14:15'",
            "UPDATE venues SET lng = 181",
        ):
            with pytest.raises(IntegrityError), database.begin() as connection:
                connection.execute(text(sql))

        with database.begin() as connection:
            connection.execute(text("UPDATE people SET email = 'Short@example.test'"))
        command.downgrade(config, "011")
        with database.begin() as connection:
            assert connection.scalar(text("SELECT start_time FROM events")) == "09:15"
            assert connection.scalar(text("SELECT lat FROM venues WHERE id = 'venue'")) == 0
            assert connection.scalar(text("SELECT public_email FROM app_settings")) == ""
            assert connection.scalar(text("SELECT search_email FROM people")) == "short@example.test"
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
