"""Add products.required.

Some products are prerequisites for others at the same event — a VIP evening
might sell an entry ticket as one product and an extra bottle of champagne as
another, where the bottle only makes sense once the ticket is in the order.
`required` marks the former; registration creation rejects an order that
includes an optional (non-required) product without also including at least
one required product, for events that have any required products configured.

Revision ID: 008
Revises: 007
Create Date: 2026-08-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("products", sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("products", "required", server_default=None)


def downgrade() -> None:
    op.drop_column("products", "required")
