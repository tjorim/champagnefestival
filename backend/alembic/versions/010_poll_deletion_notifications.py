"""Durable snapshots for volunteer poll deletion emails.

Revision ID: 010
Revises: 009
"""

import sqlalchemy as sa

from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "poll_deletion_notifications",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("recipient", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("poll_deletion_notifications")
