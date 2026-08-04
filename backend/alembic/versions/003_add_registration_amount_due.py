"""Add registrations.amount_due for offline-settled fees (e.g. bourse table rental).

Revision ID: 003
Revises: 002
Create Date: 2026-08-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("registrations", sa.Column("amount_due", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("registrations", "amount_due")
