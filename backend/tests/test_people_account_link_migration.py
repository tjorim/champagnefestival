"""Migration 018 links people to accounts by key and never guesses on odd or ambiguous legacy data (#1655)."""

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

VOLUNTEER_PERIOD = (
    "INSERT INTO person_role_periods (person_id, role, position, removed) VALUES (:id, 'volunteer', 0, false)"
)


def _person(connection, person_id, *, email="", subject=None, anonymised=False, niss=None, eid=None, volunteer=False):
    connection.execute(
        text(
            "INSERT INTO people (id, name, email, oidc_subject, anonymised, national_register_number, "
            "eid_document_number) VALUES (:id, :id, :email, :subject, :anonymised, :niss, :eid)"
        ),
        {"id": person_id, "email": email, "subject": subject, "anonymised": anonymised, "niss": niss, "eid": eid},
    )
    if volunteer:
        connection.execute(text(VOLUNTEER_PERIOD), {"id": person_id})


def _user(connection, user_id, *, subject=None, email=None):
    connection.execute(
        text("INSERT INTO users (id, oidc_subject, verified_email) VALUES (:id, :subject, :email)"),
        {"id": user_id, "subject": subject, "email": email},
    )


def test_people_are_linked_by_verified_identity_and_ambiguity_leaves_the_link_empty(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    schema = f"test_account_link_{uuid4().hex}"
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
        command.upgrade(config, "017")
        with database.begin() as connection:
            # --- subject link -------------------------------------------------------------------------
            _user(connection, "usr-known", subject="sub-known")
            _person(connection, "by-known-subject", subject="sub-known")
            _person(connection, "by-new-subject", subject="sub-never-signed-in")  # no account row yet
            _person(connection, "blank-subject", subject="")  # odd legacy value: ignored
            _person(connection, "space-subject", subject="   ")
            # A person whose subject account also proves a *different* person's address: subject wins.
            _user(connection, "usr-both", subject="sub-both", email="both@example.com")
            _person(connection, "both-subject", subject="sub-both")
            _person(connection, "both-address", email="both@example.com")

            # --- verified-email link ------------------------------------------------------------------
            _user(connection, "usr-unique", email="unique@example.com")
            _person(connection, "unique-holder", email="  Unique@Example.com ")  # differently cased, padded
            _user(connection, "usr-shared", email="shared@example.com")
            _person(connection, "shared-1", email="shared@example.com")
            _person(connection, "shared-2", email="SHARED@example.com")  # shared inbox: ambiguous
            _user(connection, "usr-dup-a", email="Twin@Example.com")
            _user(connection, "usr-dup-b", email="twin@example.com")  # two accounts, one normalised address
            _person(connection, "twin", email="twin@example.com")
            _user(connection, "usr-gone", email="gone@example.com")
            _person(connection, "erased", email="gone@example.com", anonymised=True)
            _user(connection, "usr-niss", email="niss@example.com")
            _person(connection, "has-niss", email="niss@example.com", niss="91010112345")
            _user(connection, "usr-eid", email="eid@example.com")
            _person(connection, "has-eid", email="eid@example.com", eid="BEX123456")
            _user(connection, "usr-vol", email="vol@example.com")
            _person(connection, "volunteer-role", email="vol@example.com", volunteer=True)
            _user(connection, "usr-taken", subject="sub-taken", email="taken@example.com")
            _person(connection, "taken-by-subject", subject="sub-taken")
            _person(connection, "taken-address", email="taken@example.com")
            _user(connection, "usr-no-email", subject="sub-no-email")
            _person(connection, "no-email", email="")
            _user(connection, "usr-visitor", email="nobody@example.com")  # no person at all

        command.upgrade(config, "018")

        with database.begin() as connection:
            links = dict(connection.execute(text("SELECT id, user_id FROM people")).all())
            subjects = dict(connection.execute(text("SELECT id, oidc_subject FROM users")).all())
            columns = {column["name"] for column in inspect(connection).get_columns("people")}
        assert "oidc_subject" not in columns

        assert links["by-known-subject"] == "usr-known"
        assert subjects[links["by-new-subject"]] == "sub-never-signed-in"
        assert links["blank-subject"] is None and links["space-subject"] is None
        assert links["both-subject"] == "usr-both" and links["both-address"] is None
        assert links["unique-holder"] == "usr-unique"
        for ambiguous in ("shared-1", "shared-2", "twin", "erased", "has-niss", "has-eid", "volunteer-role"):
            assert links[ambiguous] is None, ambiguous
        assert links["taken-by-subject"] == "usr-taken" and links["taken-address"] is None
        assert links["no-email"] is None
        # No account row was invented for a blank subject, and every linked account exists once.
        assert not [user for user in subjects.values() if user is not None and not user.strip()]
        assert len({link for link in links.values() if link}) == len([link for link in links.values() if link])

        # The link is unique, and deleting the account only clears it.
        with pytest.raises(IntegrityError), database.begin() as connection:
            connection.execute(text("UPDATE people SET user_id = 'usr-known' WHERE id = 'no-email'"))
        with database.begin() as connection:
            connection.execute(text("DELETE FROM users WHERE id = 'usr-known'"))
            assert (
                connection.execute(text("SELECT user_id FROM people WHERE id = 'by-known-subject'")).scalar_one()
                is None
            )
            connection.execute(
                text("INSERT INTO users (id, oidc_subject) VALUES ('usr-known', 'sub-known')"),
            )
            connection.execute(text("UPDATE people SET user_id = 'usr-known' WHERE id = 'by-known-subject'"))

        # Downgrade restores the subject for people linked to an account that has one.
        command.downgrade(config, "017")
        with database.begin() as connection:
            restored = dict(connection.execute(text("SELECT id, oidc_subject FROM people")).all())
            assert "user_id" not in {column["name"] for column in inspect(connection).get_columns("people")}
        assert restored["by-known-subject"] == "sub-known"
        assert restored["by-new-subject"] == "sub-never-signed-in"
        assert restored["both-subject"] == "sub-both"
        assert restored["unique-holder"] is None  # linked to an email-only account: the downgrade drops that link
        assert restored["shared-1"] is None

        command.upgrade(config, "018")
        with database.begin() as connection:
            assert (
                connection.execute(text("SELECT user_id FROM people WHERE id = 'by-known-subject'")).scalar_one()
                == "usr-known"
            )
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
