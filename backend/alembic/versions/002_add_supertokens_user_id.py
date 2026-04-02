"""Add supertokens_user_id column to people table.

Revision ID: 002
Revises: 001
Create Date: 2026-04-02
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
    op.add_column(
        "people",
        sa.Column("supertokens_user_id", sa.String(64), unique=True, nullable=True),
    )
    op.create_index("ix_people_supertokens_user_id", "people", ["supertokens_user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_people_supertokens_user_id", table_name="people")
    op.drop_column("people", "supertokens_user_id")
