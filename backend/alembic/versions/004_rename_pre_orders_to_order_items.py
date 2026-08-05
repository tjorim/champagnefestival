"""Rename registrations.pre_orders to order_items.

Guests never actually "pre-order" anything separate from registering — the
line items (a bottle of champagne, a cheese platter, ...) are part of the
same registration, not a distinct advance-order step. The name never matched
what the feature does, so the column, the API field, and all the surrounding
identifiers/copy are renamed to describe what's actually there.

A plain column rename (metadata-only in Postgres) preserves the existing
data; no backfill needed.

Revision ID: 004
Revises: 003
Create Date: 2026-08-05
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("registrations", "pre_orders", new_column_name="order_items")


def downgrade() -> None:
    op.alter_column("registrations", "order_items", new_column_name="pre_orders")
