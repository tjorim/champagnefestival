"""Add audit_entries table for operational audit trail.

Revision ID: 004
Revises: 003
Create Date: 2026-05-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_entries",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(255), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(64), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("details", sa.JSON, nullable=False, server_default="{}"),
    )
    op.create_index("ix_audit_entries_timestamp", "audit_entries", ["timestamp"])
    op.create_index("ix_audit_entries_actor", "audit_entries", ["actor"])
    op.create_index("ix_audit_entries_action", "audit_entries", ["action"])
    op.create_index("ix_audit_entries_resource_type", "audit_entries", ["resource_type"])
    op.create_index("ix_audit_entries_resource_id", "audit_entries", ["resource_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_entries_resource_id", table_name="audit_entries")
    op.drop_index("ix_audit_entries_resource_type", table_name="audit_entries")
    op.drop_index("ix_audit_entries_action", table_name="audit_entries")
    op.drop_index("ix_audit_entries_actor", table_name="audit_entries")
    op.drop_index("ix_audit_entries_timestamp", table_name="audit_entries")
    op.drop_table("audit_entries")
