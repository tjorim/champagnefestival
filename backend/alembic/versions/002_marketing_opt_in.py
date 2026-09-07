"""Add marketing opt-in consent fields to people.

Revision ID: 002
Revises: 001
"""

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "people",
        sa.Column("marketing_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "people",
        sa.Column("marketing_opt_in_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("people", "marketing_opt_in_at")
    op.drop_column("people", "marketing_opt_in")
