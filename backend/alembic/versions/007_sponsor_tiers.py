"""Let organisers tier sponsors per edition (#1226).

Editions gain ``sponsor_tiers``, a JSON object mapping a lineup sponsor's organization id
to its level (``main``, ``partner`` or ``supporter``). The lineup itself
(``editions.organizations``) is untouched, so existing lineups keep their order; existing
editions start with no tiers, which renders exactly as before.

Revision ID: 007
Revises: 006
"""

import sqlalchemy as sa

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("editions", sa.Column("sponsor_tiers", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    # Like the other JSON columns, the application always supplies a value.
    op.alter_column("editions", "sponsor_tiers", server_default=None)


def downgrade() -> None:
    op.drop_column("editions", "sponsor_tiers")
