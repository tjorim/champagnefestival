"""Add a free-text notes field to volunteer_periods for a rough per-period schedule/notepad (e.g. "Fri: bar, Sat: serving"), admin-only.

Revision ID: 003
Revises: 002
"""

import sqlalchemy as sa

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("volunteer_periods", sa.Column("notes", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("volunteer_periods", "notes")
