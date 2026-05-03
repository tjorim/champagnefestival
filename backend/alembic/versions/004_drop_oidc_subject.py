"""Drop people.oidc_subject — column is unused; admin identity resolved via ADMIN_USERNAMES.

Revision ID: 004
Revises: 003
Create Date: 2026-05-03
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
    op.drop_index("ix_people_oidc_subject", table_name="people")
    op.drop_column("people", "oidc_subject")


def downgrade() -> None:
    op.add_column(
        "people",
        sa.Column("oidc_subject", sa.String(64), unique=True, nullable=True),
    )
    op.create_index("ix_people_oidc_subject", "people", ["oidc_subject"], unique=True)
