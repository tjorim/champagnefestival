"""Add volunteer_periods table, reservation_access_tokens table, and drop help-day columns from people.

Volunteer help periods are now stored in a dedicated volunteer_periods table
so a person can cover multiple non-contiguous festival dates.  The old
first_help_day / last_help_day columns on people are removed; they were never
populated in production so no data migration is required.

Also adds reservation_access_tokens for short-lived visitor access tokens
used to view reservations via a secure e-mail link.

Revision ID: 002
Revises: 001
Create Date: 2026-03-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_tables = inspect(bind).get_table_names()

    if "volunteer_periods" not in existing_tables:
        op.create_table(
            "volunteer_periods",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "volunteer_id",
                sa.String(64),
                sa.ForeignKey("people.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("first_help_day", sa.Date, nullable=False),
            sa.Column("last_help_day", sa.Date, nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.create_index("ix_volunteer_periods_volunteer_id", "volunteer_periods", ["volunteer_id"])
        op.create_index("ix_volunteer_periods_first_help_day", "volunteer_periods", ["first_help_day"])

    people_cols = [c["name"] for c in inspect(bind).get_columns("people")]
    with op.batch_alter_table("people") as batch_op:
        if "first_help_day" in people_cols:
            batch_op.drop_column("first_help_day")
        if "last_help_day" in people_cols:
            batch_op.drop_column("last_help_day")

    if "reservation_access_tokens" not in existing_tables:
        op.create_table(
            "reservation_access_tokens",
            sa.Column("id", sa.String(64), nullable=False),
            sa.Column("email", sa.String(200), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("email"),
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

    with op.batch_alter_table("people") as batch_op:
        batch_op.add_column(sa.Column("first_help_day", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("last_help_day", sa.Date(), nullable=True))

    op.drop_index("ix_volunteer_periods_first_help_day", table_name="volunteer_periods")
    op.drop_index("ix_volunteer_periods_volunteer_id", table_name="volunteer_periods")
    op.drop_table("volunteer_periods")
