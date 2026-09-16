"""Add a per-edition admin scratchpad — a free-text planning notepad scoped to one edition, not a single global blob that would accumulate clutter across editions.

Revision ID: 004
Revises: 003
"""

import sqlalchemy as sa

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("editions", sa.Column("scratchpad", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("editions", "scratchpad")
