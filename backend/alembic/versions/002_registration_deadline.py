"""Add the event registration closing deadline.

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
    op.add_column("events", sa.Column("registrations_close_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "registrations_close_at")
