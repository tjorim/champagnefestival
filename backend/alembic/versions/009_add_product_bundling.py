"""Add products.included_product_id and products.included_per_guests.

Some products bundle a free quantity of another product, scaled to the
registration's guest count — a VIP table might include one bottle of
champagne per two guests, with additional bottles purchasable on top. The
included product is just another `Product` on the same event (the same one
sold standalone as an "extra"); the bundling product names it and the ratio
to apply against `Registration.guest_count`.

`ON DELETE SET NULL` (not CASCADE): deleting the bundled product should stop
the free-inclusion rule, not block the delete or cascade into products that
have nothing to do with the one being removed.

Revision ID: 009
Revises: 008
Create Date: 2026-08-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("products", sa.Column("included_product_id", sa.String(64), nullable=True))
    op.add_column("products", sa.Column("included_per_guests", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_products_included_product_id",
        "products",
        "products",
        ["included_product_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_products_included_product_id", "products", type_="foreignkey")
    op.drop_column("products", "included_per_guests")
    op.drop_column("products", "included_product_id")
