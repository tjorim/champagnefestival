"""Add visitor reservation access token table.

Revision ID: 002
Revises: 001
Create Date: 2026-03-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reservation_access_tokens",
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("email", sa.String(200), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_reservation_access_tokens_email",
        "reservation_access_tokens",
        ["email"],
    )
    op.create_index(
        "ix_reservation_access_tokens_expires_at",
        "reservation_access_tokens",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_reservation_access_tokens_expires_at", table_name="reservation_access_tokens")
    op.drop_index("ix_reservation_access_tokens_email", table_name="reservation_access_tokens")
    op.drop_table("reservation_access_tokens")
