"""Validate and constrain fixed vocabularies.

Revision ID: 013
Revises: 012
"""

import sqlalchemy as sa

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None

# Freeze the values for replay even when a later release changes a vocabulary.
# The repair runs only for rows outside the allowed set; SQL NULL is preserved.
_AUDIT_SOURCES = ("unknown", "none", "integration", "keycloak", "token", "visitor_session")
_AUDIT_SOURCE_MAPPING = "WHEN 'oidc' THEN 'keycloak' WHEN 'visitor' THEN 'visitor_session' ELSE 'unknown' END"

_COLUMNS = (
    ("organizations", "type", ("producer", "sponsor", "vendor"), "type = 'vendor'"),
    ("table_types", "shape", ("rectangle", "round"), "shape = 'rectangle'"),
    ("table_types", "height_type", ("low", "high"), "height_type = 'low'"),
    (
        "outbox_jobs",
        "state",
        ("pending", "processing", "delivered", "failed"),
        "state = 'failed', locked_until = NULL, claim_token = NULL, "
        "completed_at = coalesce(completed_at, CURRENT_TIMESTAMP), last_error_code = 'legacy_state'",
    ),
    ("delivery_attempts", "outcome", ("delivered", "failed", "unknown"), "outcome = 'unknown'"),
    (
        "signage_video_exports",
        "state",
        ("preparing", "submitted", "queued", "running", "ready", "failed", "cancelled", "expired"),
        "state = 'failed', error_code = 'legacy_state'",
    ),
    (
        "signage_video_exports",
        "profile",
        ("signage-slideshow-v1",),
        "profile = 'signage-slideshow-v1', state = 'failed', error_code = 'legacy_profile'",
    ),
    (
        "integration_clients",
        "allowed_role",
        ("admin", "volunteer"),
        "allowed_role = 'volunteer', is_active = false, revoked_at = coalesce(revoked_at, CURRENT_TIMESTAMP)",
    ),
    (
        "email_consents",
        "source",
        ("self_service", "registration_form", "unknown"),
        "source = 'unknown'",
    ),
    (
        "email_consents",
        "revoked_source",
        ("self_service", "admin", "merged", "unsubscribe_link", "unknown"),
        "revoked_source = 'unknown'",
    ),
    (
        "audit_entries",
        "auth_source",
        _AUDIT_SOURCES,
        f"auth_source = CASE auth_source {_AUDIT_SOURCE_MAPPING}",
    ),
    (
        "organization_changes",
        "submitted_auth_source",
        _AUDIT_SOURCES,
        f"submitted_auth_source = CASE submitted_auth_source {_AUDIT_SOURCE_MAPPING}",
    ),
    ("push_subscriptions", "locale", ("nl", "fr", "en"), "locale = 'nl'"),
    ("signage_video_exports", "locale", ("nl", "fr", "en"), "locale = 'nl'"),
)


def upgrade() -> None:
    bind = op.get_bind()
    for table, column, values, repair in _COLUMNS:
        allowed = ", ".join(f"'{value}'" for value in values)
        invalid = f"{column} NOT IN ({allowed})"
        bind.execute(sa.text(f"UPDATE {table} SET {repair} WHERE {invalid}"))
        if bind.scalar(sa.text(f"SELECT EXISTS (SELECT 1 FROM {table} WHERE {invalid})")):
            raise RuntimeError(f"Could not normalize {table}.{column}")
        op.create_check_constraint(f"ck_{table}_{column}", table, f"{column} IN ({allowed})")


def downgrade() -> None:
    for table, column, _, _ in reversed(_COLUMNS):
        op.drop_constraint(f"ck_{table}_{column}", table, type_="check")
