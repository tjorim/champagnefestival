"""Add users table and user_id FK on registrations.

Revision ID: 002
Revises: 001
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("oidc_subject", sa.String(255), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_oidc_subject", "users", ["oidc_subject"], unique=True)

    op.add_column(
        "registrations",
        sa.Column(
            "user_id",
            sa.String(64),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_registrations_user_id", "registrations", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_registrations_user_id", table_name="registrations")
    op.drop_column("registrations", "user_id")
    op.drop_index("ix_users_oidc_subject", table_name="users")
    op.drop_table("users")
