"""Add registrations.amount_due, edition co-organiser, and event-scoped products.

Consolidates what shipped as seven incremental migrations during development
of this PR into one step, since none of the intermediate states were ever
applied to a real database: bourse table fees (`amount_due`), dropping the
never-actually-used edition external-partner fields in favor of linking a
real co-organising `Exhibitor`, and event-scoped `Product`s with required and
bundled variants. `events.allow_preorders` — added and then dropped again
within that same development window, superseded by "does this event have any
active products" — never appears here at all.

Revision ID: 003
Revises: 002
Create Date: 2026-08-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- Bourse table fees, settled offline -----------------------------------
    op.add_column("registrations", sa.Column("amount_due", sa.Numeric(10, 2), nullable=True))

    # --- Edition co-organiser, replacing the unused external-partner fields ---
    op.drop_column("editions", "external_contact_email")
    op.drop_column("editions", "external_contact_name")
    op.drop_column("editions", "external_partner")

    op.add_column("editions", sa.Column("co_organiser_exhibitor_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_editions_co_organiser_exhibitor_id",
        "editions",
        "exhibitors",
        ["co_organiser_exhibitor_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- Event-scoped products, with required and bundled variants ------------
    op.create_table(
        "products",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("event_id", sa.String(64), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("included_product_id", sa.String(64), nullable=True),
        sa.Column("included_per_guests", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["included_product_id"],
            ["products.id"],
            name="fk_products_included_product_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_products_event_id", "products", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_products_event_id", table_name="products")
    op.drop_table("products")

    op.drop_constraint("fk_editions_co_organiser_exhibitor_id", "editions", type_="foreignkey")
    op.drop_column("editions", "co_organiser_exhibitor_id")

    # Recreates the columns, but not the values they held.
    op.add_column("editions", sa.Column("external_partner", sa.String(200), nullable=True))
    op.add_column("editions", sa.Column("external_contact_name", sa.String(200), nullable=True))
    op.add_column("editions", sa.Column("external_contact_email", sa.String(200), nullable=True))

    op.drop_column("registrations", "amount_due")
