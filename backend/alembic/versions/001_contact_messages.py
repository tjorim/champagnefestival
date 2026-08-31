"""Persist Phase 1 operations and remove stale table reservation data.

Revision ID: 001
Revises: 000
"""

import sqlalchemy as sa

from alembic import op

revision: str = "001"
down_revision: str | None = "000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("client_ip", sa.String(45), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_contact_messages_created_at", "contact_messages", ["created_at"])
    op.add_column(
        "app_settings",
        sa.Column(
            "public_email",
            sa.String(320),
            nullable=False,
            server_default="nancy.cattrysse@telenet.be",
        ),
    )
    op.alter_column("table_types", "max_capacity", new_column_name="capacity")
    op.drop_column("tables", "reservation_ids")
    op.drop_column("tables", "capacity")
    op.create_table(
        "outbox_jobs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("job_type", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(64), nullable=False),
        sa.Column("deduplication_key", sa.String(200), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claim_token", sa.String(64), nullable=True),
        sa.Column("last_error_code", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("deduplication_key", name="uq_outbox_jobs_deduplication_key"),
    )
    op.create_index("ix_outbox_jobs_job_type", "outbox_jobs", ["job_type"])
    op.create_index("ix_outbox_jobs_resource_id", "outbox_jobs", ["resource_id"])
    op.create_index("ix_outbox_jobs_state", "outbox_jobs", ["state"])
    op.create_index("ix_outbox_jobs_scheduled_at", "outbox_jobs", ["scheduled_at"])
    op.create_table(
        "delivery_attempts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("job_id", sa.String(64), sa.ForeignKey("outbox_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_delivery_attempts_job_id", "delivery_attempts", ["job_id"])
    op.add_column(
        "app_settings",
        sa.Column("public_phone", sa.String(30), nullable=False, server_default="+32 478 48 01 77"),
    )
    op.add_column(
        "app_settings",
        sa.Column(
            "facebook_url",
            sa.String(500),
            nullable=False,
            server_default="https://www.facebook.com/champagnefestival.kust",
        ),
    )


def downgrade() -> None:
    op.add_column(
        "tables",
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="4"),
    )
    op.alter_column("table_types", "capacity", new_column_name="max_capacity")
    op.add_column(
        "tables",
        sa.Column("reservation_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.drop_index("ix_delivery_attempts_job_id", table_name="delivery_attempts")
    op.drop_table("delivery_attempts")
    op.drop_index("ix_outbox_jobs_scheduled_at", table_name="outbox_jobs")
    op.drop_index("ix_outbox_jobs_state", table_name="outbox_jobs")
    op.drop_index("ix_outbox_jobs_resource_id", table_name="outbox_jobs")
    op.drop_index("ix_outbox_jobs_job_type", table_name="outbox_jobs")
    op.drop_table("outbox_jobs")
    op.drop_column("app_settings", "facebook_url")
    op.drop_column("app_settings", "public_phone")
    op.drop_column("app_settings", "public_email")
    op.drop_index("ix_contact_messages_created_at", table_name="contact_messages")
    op.drop_table("contact_messages")
