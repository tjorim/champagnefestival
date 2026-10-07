"""Add optional multilingual exhibitor descriptions (#1191).

Revision ID: 004
Revises: 003
"""

import sqlalchemy as sa

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exhibitors", sa.Column("description_language", sa.String(2), nullable=True))
    for language in ("nl", "fr", "en"):
        op.add_column("exhibitors", sa.Column(f"description_{language}", sa.String(600), nullable=True))
    op.create_check_constraint(
        "ck_exhibitors_description_original",
        "exhibitors",
        "(description_language IS NULL AND description_nl IS NULL AND description_fr IS NULL "
        "AND description_en IS NULL) OR "
        "(description_language IS NOT NULL AND ("
        "(description_language = 'nl' AND length(trim(description_nl)) > 0) OR "
        "(description_language = 'fr' AND length(trim(description_fr)) > 0) OR "
        "(description_language = 'en' AND length(trim(description_en)) > 0)) IS TRUE)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_exhibitors_description_original", "exhibitors", type_="check")
    for field in ("description_en", "description_fr", "description_nl", "description_language"):
        op.drop_column("exhibitors", field)
