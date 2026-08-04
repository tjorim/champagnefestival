"""Drop the edition external-partner columns.

The concept never matched reality: off-festival editions are run by the vzw
itself, and the venue is already modelled separately as a Venue. The columns
were only ever populated by hand, so nothing derives from them.

Revision ID: 004
Revises: 003
Create Date: 2026-08-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("editions", "external_contact_email")
    op.drop_column("editions", "external_contact_name")
    op.drop_column("editions", "external_partner")


def downgrade() -> None:
    # Recreates the columns, but not the values they held.
    op.add_column("editions", sa.Column("external_partner", sa.String(200), nullable=True))
    op.add_column("editions", sa.Column("external_contact_name", sa.String(200), nullable=True))
    op.add_column("editions", sa.Column("external_contact_email", sa.String(200), nullable=True))
