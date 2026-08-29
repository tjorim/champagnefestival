"""Persist Phase 1 contact messages and public contact settings.

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
    op.drop_column("app_settings", "facebook_url")
    op.drop_column("app_settings", "public_phone")
    op.drop_column("app_settings", "public_email")
    op.drop_index("ix_contact_messages_created_at", table_name="contact_messages")
    op.drop_table("contact_messages")
