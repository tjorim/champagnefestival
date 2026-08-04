"""Add products table; drop events.allow_preorders.

Replaces the hardcoded, global product catalogue (five fixed items at fixed
prices, shared across every event) with real per-event `Product` rows admins
can create and price. `allow_preorders` — added one migration ago as a manual
gate — is superseded by a simpler signal: an event can be pre-ordered from if
and only if it has at least one active product, so the column is dropped
again rather than kept alongside the new table.

Revision ID: 007
Revises: 006
Create Date: 2026-08-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("event_id", sa.String(64), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_products_event_id", "products", ["event_id"])

    op.drop_column("events", "allow_preorders")


def downgrade() -> None:
    op.add_column("events", sa.Column("allow_preorders", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("events", "allow_preorders", server_default=None)

    op.drop_index("ix_products_event_id", table_name="products")
    op.drop_table("products")
