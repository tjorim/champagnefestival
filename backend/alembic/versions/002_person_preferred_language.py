"""Add an explicit communication-language preference to people."""

import sqlalchemy as sa

from alembic import op

revision = "002_person_preferred_language"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("people", sa.Column("preferred_language", sa.String(length=2), nullable=True))
    op.create_check_constraint(
        "ck_people_preferred_language",
        "people",
        "preferred_language IS NULL OR preferred_language IN ('nl', 'fr', 'en')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_people_preferred_language", "people", type_="check")
    op.drop_column("people", "preferred_language")
