"""Private durable signage video exports.

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
        "signage_video_exports",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("creator", sa.String(255), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("channel_id", sa.String(64), sa.ForeignKey("signage_channels.id", ondelete="SET NULL")),
        sa.Column("channel_name", sa.String(200), nullable=False),
        sa.Column("locale", sa.String(2), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("profile", sa.String(40), nullable=False),
        sa.Column("uploads", sa.JSON(), nullable=False),
        sa.Column("payload_digest", sa.String(64)),
        sa.Column("worker_id", sa.String(64), unique=True),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("acknowledged", sa.Boolean(), nullable=False),
        sa.Column("local_cleaned", sa.Boolean(), nullable=False),
        sa.Column("error_code", sa.String(64)),
        sa.Column("artifact", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("creator", "idempotency_key", name="uq_signage_video_creator_key"),
    )
    for column in ("creator", "channel_id", "state", "expires_at", "next_attempt_at"):
        op.create_index(f"ix_signage_video_exports_{column}", "signage_video_exports", [column])


def downgrade() -> None:
    op.drop_table("signage_video_exports")
