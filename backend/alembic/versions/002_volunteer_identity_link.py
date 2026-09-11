"""Link an OIDC-authenticated volunteer to their Person record (#1006).

Revision ID: 002
Revises: 001
"""

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("people", sa.Column("oidc_subject", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_people_oidc_subject", "people", ["oidc_subject"])


def downgrade() -> None:
    op.drop_constraint("uq_people_oidc_subject", "people", type_="unique")
    op.drop_column("people", "oidc_subject")
