"""Add public contact settings.

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
