"""Migration 010 (its email consent part) seeds the email categories, enforces one open consent and drops the old flag."""

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


def test_email_consent_migration(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_consent_{uuid4().hex}"
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
                    "INSERT INTO people (id, name, email, roles, retired_roles, role_history, anonymised, marketing_opt_in) "
                    "VALUES ('opted', 'Opted In', 'opted@example.com', '[]', '{}', '{}', false, true)"
                )
            )
        command.upgrade(config, "010")
        with database.begin() as conn:
            categories = conn.execute(
                text("SELECT key, allowed_roles, automatic FROM email_categories ORDER BY sort_order")
            ).all()
            assert [(row[0], row[1], row[2]) for row in categories] == [
                ("club_news", ["member"], False),
                ("new_editions", [], False),
                ("volunteer_news", ["volunteer"], False),
                ("reward_ready", ["member"], True),
            ]
            # Nobody is migrated into consent: everyone starts unsubscribed.
            assert conn.execute(text("SELECT count(*) FROM email_consents")).scalar_one() == 0
            assert conn.execute(text("SELECT count(*) FROM people")).scalar_one() == 1
            columns = conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = :schema AND table_name = 'people' AND column_name LIKE 'marketing%'"
                ),
                {"schema": schema},
            ).all()
            assert columns == []
            conn.execute(
                text(
                    "INSERT INTO email_consents (id, person_id, category_key, granted_at, source) "
                    "VALUES ('c1', 'opted', 'new_editions', now(), 'self_service')"
                )
            )
        # One open grant per person and category; a withdrawn one does not count.
        with pytest.raises(IntegrityError), database.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO email_consents (id, person_id, category_key, granted_at, source) "
                    "VALUES ('c2', 'opted', 'new_editions', now(), 'self_service')"
                )
            )
        with database.begin() as conn:
            conn.execute(
                text("UPDATE email_consents SET revoked_at = now(), revoked_source = 'self_service' WHERE id = 'c1'")
            )
            conn.execute(
                text(
                    "INSERT INTO email_consents (id, person_id, category_key, granted_at, source) "
                    "VALUES ('c2', 'opted', 'new_editions', now(), 'self_service')"
                )
            )
        # A revocation date and its source go together.
        with pytest.raises(IntegrityError), database.begin() as conn:
            conn.execute(text("UPDATE email_consents SET revoked_at = now() WHERE id = 'c2'"))
        # A category that has consent cannot be dropped.
        with pytest.raises(IntegrityError), database.begin() as conn:
            conn.execute(text("DELETE FROM email_categories WHERE key = 'new_editions'"))
        command.downgrade(config, "009")
        with database.begin() as conn:
            assert conn.execute(text("SELECT marketing_opt_in FROM people WHERE id = 'opted'")).scalar_one() is False
        command.upgrade(config, "head")
        # Reflection must agree with the models, including the partial unique index.
        command.check(config)
    finally:
        database.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
