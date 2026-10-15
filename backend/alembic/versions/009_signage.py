"""Edition-scoped signage channels, canvas templates and scheduled slides.

Revision ID: 009
Revises: 008
"""

import sqlalchemy as sa

from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "signage_channels",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("epoch", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.create_table(
        "signage_templates",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("background", sa.JSON(), nullable=False),
        sa.Column("layers", sa.JSON(), nullable=False),
    )
    op.create_table(
        "signage_slides",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "channel_id", sa.String(64), sa.ForeignKey("signage_channels.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "template_id", sa.String(64), sa.ForeignKey("signage_templates.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("duration", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.CheckConstraint("duration > 0 AND duration <= 3600", name="ck_signage_duration"),
        sa.CheckConstraint("kind IN ('organizations', 'notice', 'image')", name="ck_signage_kind"),
        sa.CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="ck_signage_window"),
    )
    op.create_index("ix_signage_slides_channel_id", "signage_slides", ["channel_id"])


def downgrade() -> None:
    op.drop_table("signage_slides")
    op.drop_table("signage_templates")
    op.drop_table("signage_channels")
