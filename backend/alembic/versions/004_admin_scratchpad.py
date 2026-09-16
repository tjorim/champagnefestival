"""Add a single shared admin scratchpad — a general free-text notepad, not tied to any volunteer, period, or edition; admin-only, never exposed through the public app_settings endpoint.

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
    op.create_table(
        "admin_scratchpad",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("admin_scratchpad")
