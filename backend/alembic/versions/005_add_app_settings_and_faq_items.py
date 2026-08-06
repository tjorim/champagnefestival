"""Add app_settings singleton and faq_items tables.

app_settings holds site-wide toggles (currently just maintenance_mode) as a
single row with a fixed id, so the admin dashboard can flip maintenance mode
live without a redeploy.

faq_items replaces the previously-hardcoded, per-locale FAQ text in the
frontend translation catalogs with admin-editable content, so festival
details (dates, arrangements, house rules) don't need a code change every
edition.

Revision ID: 005
Revises: 004
Create Date: 2026-08-06
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("maintenance_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "faq_items",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("question", sa.String(500), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("faq_items")
    op.drop_table("app_settings")
