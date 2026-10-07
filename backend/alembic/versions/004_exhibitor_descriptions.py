"""Add exhibitor descriptions and private proposal history (#1191, #1193).

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

    op.create_table(
        "exhibitor_changes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("exhibitor_id", sa.Integer(), sa.ForeignKey("exhibitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submitted_by", sa.String(255), nullable=False),
        sa.Column("submitted_auth_source", sa.String(64)),
        sa.Column("submitted_values", sa.JSON(), nullable=False),
        sa.Column("proposed", sa.JSON(), nullable=False),
        sa.Column("superseded_fields", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(2000)),
        sa.Column("notification_recipient", sa.String(320)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'superseded', 'replaced')", name="ck_exhibitor_change_status"
        ),
    )
    op.create_index("ix_exhibitor_changes_exhibitor_id", "exhibitor_changes", ["exhibitor_id"])
    op.create_index(
        "uq_exhibitor_pending_change",
        "exhibitor_changes",
        ["exhibitor_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_table("exhibitor_changes")
    op.drop_constraint("ck_exhibitors_description_original", "exhibitors", type_="check")
    for field in ("description_en", "description_fr", "description_nl", "description_language"):
        op.drop_column("exhibitors", field)
