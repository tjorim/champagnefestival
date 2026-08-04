"""Add editions.co_organiser_exhibitor_id.

Some off-festival editions are co-organised with a champagne producer, who
already exists as an Exhibitor. A link keeps their name, logo and website in one
place rather than retyping them per edition. Kept out of `editions.exhibitors`
because that list is the festival lineup, which non-festival editions cannot
carry — co-organising is a different relationship.

Revision ID: 005
Revises: 004
Create Date: 2026-08-04
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
    op.add_column("editions", sa.Column("co_organiser_exhibitor_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_editions_co_organiser_exhibitor_id",
        "editions",
        "exhibitors",
        ["co_organiser_exhibitor_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_editions_co_organiser_exhibitor_id", "editions", type_="foreignkey")
    op.drop_column("editions", "co_organiser_exhibitor_id")
