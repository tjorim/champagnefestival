"""Exercise the data-bearing domain rename, its rollback and re-upgrade."""

import json
import os
from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from alembic import command


def test_organization_rename_preserves_data_and_reverses(monkeypatch):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_organization_migration_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    root = Path(__file__).resolve().parents[1]
    # A file-backed Alembic config invokes fileConfig(), disabling application
    # loggers in the shared pytest process. This test needs only the script path.
    config = Config()
    config.set_main_option("script_location", str(root / "alembic"))
    database = create_engine(migration_url)
    try:
        command.upgrade(config, "004")
        with database.begin() as connection:
            connection.execute(text("INSERT INTO people (id, name) VALUES ('contact', 'Contact')"))
            organization_id = connection.scalar(
                text("""INSERT INTO exhibitors (name, image, contact_person_id)
                    VALUES ('The exhibitor association', '/uploads/exhibitors/logo.png', 'contact') RETURNING id""")
            )
            connection.execute(text("INSERT INTO venues (id, name) VALUES ('venue', 'Venue')"))
            connection.execute(
                text(
                    "INSERT INTO rooms (id, name, venue_id, width_m, length_m) VALUES ('room', 'Room', 'venue', 30, 20)"
                )
            )
            connection.execute(
                text("""INSERT INTO editions (id, year, month, exhibitors, co_organizer_exhibitor_id, venue_id)
                    VALUES ('edition', 2026, 'October', CAST(:ids AS json), :id, 'venue')"""),
                {"ids": json.dumps([organization_id]), "id": organization_id},
            )
            connection.execute(
                text("""INSERT INTO events (id, edition_id, title, date, start_time, category)
                VALUES ('event', 'edition', 'Event', '2026-10-01', '10:00', 'festival')""")
            )
            connection.execute(text("INSERT INTO layouts (id, room_id, event_id) VALUES ('layout', 'room', 'event')"))
            connection.execute(
                text("INSERT INTO areas (id, layout_id, label, exhibitor_id) VALUES ('area', 'layout', 'Area', :id)"),
                {"id": organization_id},
            )
            connection.execute(
                text("""INSERT INTO exhibitor_changes (id, exhibitor_id, submitted_by, submitted_values,
                    proposed, superseded_fields, status, created_at)
                    VALUES ('proposal', :id, 'contact', '{"website":"https://new.example"}',
                    '{"website":"https://new.example","image":"private.png"}', '[]', 'pending', now())"""),
                {"id": organization_id},
            )
            connection.execute(
                text("""INSERT INTO outbox_jobs (id, job_type, resource_type, resource_id,
                    deduplication_key, attempt_count) VALUES ('job', 'exhibitor_change_notification',
                    'exhibitor_change', 'proposal', 'exhibitor-change:proposal', 2)""")
            )
            connection.execute(
                text("""INSERT INTO audit_entries (id, timestamp, actor, action, resource_type, resource_id, details, auth_source)
                    VALUES ('audit', now(), 'contact', 'exhibitor_change_submitted', 'exhibitor', :id,
                    CAST(:details AS json), 'email_session')"""),
                {
                    "id": str(organization_id),
                    "details": json.dumps(
                        {
                            "nested": [{"exhibitor_id": organization_id, "image": "/uploads/exhibitors/logo.png"}],
                            "note": "An exhibitor wrote this text.",
                        }
                    ),
                },
            )

        def verify(domain):
            other = "exhibitor" if domain == "organization" else "organization"
            with database.begin() as connection:
                inspector = inspect(connection)
                assert f"{domain}s" in inspector.get_table_names(schema=schema)
                assert f"{other}s" not in inspector.get_table_names(schema=schema)
                row = connection.execute(text(f"SELECT name, image, contact_person_id FROM {domain}s")).one()
                assert row == ("The exhibitor association", f"/uploads/{domain}s/logo.png", "contact")
                assert connection.execute(text(f"SELECT {domain}s, co_organizer_{domain}_id FROM editions")).one() == (
                    [organization_id],
                    organization_id,
                )
                assert connection.scalar(text(f"SELECT {domain}_id FROM areas")) == organization_id
                proposal = connection.execute(text(f"SELECT {domain}_id, proposed, status FROM {domain}_changes")).one()
                assert proposal == (
                    organization_id,
                    {"website": "https://new.example", "image": "private.png"},
                    "pending",
                )
                assert connection.execute(
                    text("SELECT job_type, resource_type, deduplication_key, attempt_count FROM outbox_jobs")
                ).one() == (f"{domain}_change_notification", f"{domain}_change", f"{domain}-change:proposal", 2)
                action, resource, details = connection.execute(
                    text("SELECT action, resource_type, details FROM audit_entries WHERE id = 'audit'")
                ).one()
                assert (action, resource) == (f"{domain}_change_submitted", domain)
                assert details == {
                    "nested": [{f"{domain}_id": organization_id, "image": f"/uploads/{domain}s/logo.png"}],
                    "note": "An exhibitor wrote this text.",
                }
                # Check renamed constraints, indexes, serial sequences and FK
                # targets, rather than only the visible table/column names.
                assert (
                    connection.scalar(
                        text("""SELECT count(*) FROM pg_class c JOIN pg_namespace n
                    ON n.oid = c.relnamespace WHERE n.nspname = :schema AND strpos(c.relname, :old) > 0"""),
                        {"schema": schema, "old": other},
                    )
                    == 0
                )
                assert (
                    connection.scalar(
                        text("""SELECT count(*) FROM pg_constraint c JOIN pg_namespace n
                    ON n.oid = c.connamespace WHERE n.nspname = :schema AND strpos(c.conname, :old) > 0"""),
                        {"schema": schema, "old": other},
                    )
                    == 0
                )
                assert any(
                    fk["referred_table"] == f"{domain}s" for fk in inspector.get_foreign_keys("areas", schema=schema)
                )

        command.upgrade(config, "head")
        verify("organization")
        command.downgrade(config, "004")
        verify("exhibitor")
        command.upgrade(config, "head")
        verify("organization")
        with database.begin() as connection:
            next_id = connection.scalar(text("INSERT INTO organizations (name) VALUES ('Next') RETURNING id"))
            assert next_id > organization_id
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
