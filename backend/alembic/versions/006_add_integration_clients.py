"""Add integration_clients table for managed MCP automation credentials.

Adds a database-backed credential store for machine automation (see issue
#807): an admin issues a credential scoped to exactly one Champagnefestival
role tier (never more privileged than their own), only its hash is stored,
and it can be listed/revoked/rotated with last-used tracking. This
complements — does not replace — Keycloak client-credentials, which remain
fully supported.

Revision ID: 006
Revises: 005
Create Date: 2026-08-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "integration_clients",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("key_hash", sa.String(128), nullable=False),
        sa.Column("key_preview", sa.String(8), nullable=False),
        sa.Column("allowed_role", sa.String(20), nullable=False),
        sa.Column("created_by_actor", sa.String(255), nullable=False),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rate_limit_window_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rate_limit_window_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_integration_clients_key_hash",
        "integration_clients",
        ["key_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_integration_clients_key_hash", table_name="integration_clients")
    op.drop_table("integration_clients")
