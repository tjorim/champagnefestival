"""Drop reservation_access_tokens (#1044).

Retired the token-based "claim under any email you can prove control of"
mechanism entirely — an account can now only ever claim bookings under its
own verified email (via confirm-first or magic-link redemption), never a
different one. See docs/decisions/1044-confirm-first-registration-claiming.md.

Revision ID: 003
Revises: 002
"""

import sqlalchemy as sa

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("reservation_access_tokens")


def downgrade() -> None:
    op.create_table(
        "reservation_access_tokens",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(200), unique=True, nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
