"""Add structured authentication provenance to audit entries.

Revision ID: 007
Revises: 006
Create Date: 2026-08-09
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "audit_entries",
        sa.Column("auth_source", sa.String(32), nullable=False, server_default="unknown"),
    )
    op.add_column("audit_entries", sa.Column("subject", sa.String(255), nullable=True))
    op.add_column("audit_entries", sa.Column("integration_client_id", sa.String(64), nullable=True))
    op.execute(
        sa.text(
            """UPDATE audit_entries
               SET auth_source = CASE
                       WHEN actor = 'anonymous' THEN 'none'
                       WHEN actor LIKE 'integration:%' THEN 'integration'
                       ELSE 'keycloak'
                   END,
                   subject = CASE WHEN actor = 'anonymous' THEN NULL ELSE actor END,
                   integration_client_id = CASE
                       WHEN actor LIKE 'integration:%' THEN substring(actor FROM 13)
                       ELSE NULL
                   END"""
        )
    )
    op.alter_column("audit_entries", "auth_source", server_default=None)
    op.create_index("ix_audit_entries_auth_source", "audit_entries", ["auth_source"])
    op.create_index("ix_audit_entries_integration_client_id", "audit_entries", ["integration_client_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_entries_integration_client_id", table_name="audit_entries")
    op.drop_index("ix_audit_entries_auth_source", table_name="audit_entries")
    op.drop_column("audit_entries", "integration_client_id")
    op.drop_column("audit_entries", "subject")
    op.drop_column("audit_entries", "auth_source")
