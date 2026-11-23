"""Migration 013 repairs historical values and enforces the new checks."""

import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, insert, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from alembic import command
from app.models import (
    AuditEntry,
    DeliveryAttempt,
    EmailCategory,
    EmailConsent,
    IntegrationClient,
    Organization,
    OrganizationChange,
    OutboxJob,
    PushSubscription,
    SignageVideoExport,
    TableType,
    Venue,
)
from tests.helpers import requires_postgres

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")


def test_fixed_vocabularies_round_trip(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    schema = f"test_fixed_vocabularies_{uuid4().hex}"
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)
    now = datetime.now(UTC)
    try:
        command.upgrade(config, "012")
        with database.begin() as connection:
            connection.execute(insert(Venue).values(id="venue", name="Venue"))
            connection.execute(
                text("""
                    INSERT INTO people (id, name, retired_roles, role_history, anonymised)
                    VALUES ('person', 'Person', '{}', '{}', false)
                """)
            )
            connection.execute(insert(EmailCategory).values(key="mail", name_nl="Post"))
            organization_id = connection.scalar(
                insert(Organization).values(name="Legacy", type="legacy").returning(Organization.id)
            )
            connection.execute(
                insert(OrganizationChange).values(
                    id="proposal",
                    organization_id=organization_id,
                    submitted_by="visitor",
                    submitted_auth_source="visitor",
                    submitted_values={},
                    proposed={},
                )
            )
            connection.execute(insert(Organization).values(name="Current", type="producer"))
            connection.execute(
                insert(TableType).values(
                    id="table", name="Table", venue_id="venue", capacity=4, shape="legacy", height_type="legacy"
                )
            )
            connection.execute(
                insert(OutboxJob).values(
                    id="job",
                    job_type="registration_confirmation",
                    resource_type="registration",
                    resource_id="registration",
                    deduplication_key="job",
                    state="legacy",
                    claim_token="lease",
                    locked_until=now,
                )
            )
            connection.execute(
                insert(DeliveryAttempt).values(
                    id="attempt", job_id="job", attempt_number=1, outcome="legacy", started_at=now, finished_at=now
                )
            )
            connection.execute(
                insert(SignageVideoExport).values(
                    id="video",
                    creator="creator",
                    idempotency_key="key",
                    channel_name="Hall",
                    locale="de",
                    snapshot={},
                    state="legacy",
                    profile="legacy",
                    expires_at=now,
                )
            )
            connection.execute(
                insert(IntegrationClient).values(
                    id="client",
                    name="Client",
                    key_hash="hash",
                    key_preview="preview",
                    allowed_role="legacy",
                    created_by_actor="admin",
                )
            )
            connection.execute(
                insert(EmailConsent).values(id="open", person_id="person", category_key="mail", source="self_service")
            )
            connection.execute(
                insert(EmailConsent).values(
                    id="ended",
                    person_id="person",
                    category_key="mail",
                    source="legacy",
                    revoked_at=now,
                    revoked_source="legacy",
                )
            )
            connection.execute(
                insert(AuditEntry).values(
                    id="audit",
                    actor="staff",
                    action="created",
                    resource_type="event",
                    resource_id="event",
                    auth_source="oidc",
                )
            )
            connection.execute(
                insert(PushSubscription).values(
                    id="push", endpoint="https://example.test/push", p256dh_key="public", auth_key="auth", locale="de"
                )
            )

        command.upgrade(config, "013")
        with database.begin() as connection:
            assert connection.execute(text("SELECT type FROM organizations ORDER BY name")).scalars().all() == [
                "producer",
                "vendor",
            ]
            assert connection.execute(text("SELECT shape, height_type FROM table_types")).one() == ("rectangle", "low")
            assert connection.execute(
                text("SELECT state, claim_token, locked_until, completed_at IS NOT NULL FROM outbox_jobs")
            ).one() == ("failed", None, None, True)
            assert connection.scalar(text("SELECT outcome FROM delivery_attempts")) == "unknown"
            assert connection.execute(text("SELECT state, profile, locale FROM signage_video_exports")).one() == (
                "failed",
                "signage-slideshow-v1",
                "nl",
            )
            assert connection.execute(
                text("SELECT allowed_role, is_active, revoked_at IS NOT NULL FROM integration_clients")
            ).one() == ("volunteer", False, True)
            assert connection.execute(text("SELECT source, revoked_source FROM email_consents ORDER BY id")).all() == [
                ("unknown", "unknown"),
                ("self_service", None),
            ]
            assert connection.scalar(text("SELECT auth_source FROM audit_entries WHERE id = 'audit'")) == "keycloak"
            assert connection.scalar(text("SELECT locale FROM push_subscriptions")) == "nl"
            assert (
                connection.scalar(text("SELECT submitted_auth_source FROM organization_changes")) == "visitor_session"
            )

        for table, column in (
            ("organizations", "type"),
            ("table_types", "shape"),
            ("table_types", "height_type"),
            ("outbox_jobs", "state"),
            ("delivery_attempts", "outcome"),
            ("signage_video_exports", "state"),
            ("signage_video_exports", "profile"),
            ("signage_video_exports", "locale"),
            ("integration_clients", "allowed_role"),
            ("email_consents", "source"),
            ("email_consents", "revoked_source"),
            ("audit_entries", "auth_source"),
            ("organization_changes", "submitted_auth_source"),
            ("push_subscriptions", "locale"),
        ):
            where = " WHERE id = 'ended'" if column == "revoked_source" else ""
            with pytest.raises(IntegrityError, match=f"ck_{table}_{column}"), database.begin() as connection:
                connection.execute(text(f"UPDATE {table} SET {column} = 'xx'{where}"))

        command.downgrade(config, "012")
        with database.begin() as connection:
            connection.execute(text("UPDATE organizations SET type = 'legacy'"))
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
