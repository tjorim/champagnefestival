"""Private exhibitor proposal history (#1193).

Revision ID: 005
Revises: 004
"""

import sqlalchemy as sa

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
