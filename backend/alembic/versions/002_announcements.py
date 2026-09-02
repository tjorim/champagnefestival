"""Add scheduled localized announcements.

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
    op.create_table(
        "announcements",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("text_nl", sa.String(500), nullable=True),
        sa.Column("text_en", sa.String(500), nullable=True),
        sa.Column("text_fr", sa.String(500), nullable=True),
        sa.Column("level", sa.String(10), nullable=False, server_default="info"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("link_url", sa.String(1000), nullable=True),
        sa.Column("link_label_nl", sa.String(120), nullable=True),
        sa.Column("link_label_en", sa.String(120), nullable=True),
        sa.Column("link_label_fr", sa.String(120), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("level IN ('info', 'warning', 'urgent')", name="ck_announcements_level"),
        sa.CheckConstraint(
            "ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at",
            name="ck_announcements_window",
        ),
        sa.UniqueConstraint("sort_order", name="uq_announcements_sort_order", deferrable=True, initially="DEFERRED"),
    )


def downgrade() -> None:
    op.drop_table("announcements")
