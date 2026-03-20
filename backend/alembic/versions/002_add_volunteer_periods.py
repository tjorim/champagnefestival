"""Add volunteer_periods table and drop help-day columns from people.

Volunteer help periods are now stored in a dedicated volunteer_periods table
so a person can cover multiple non-contiguous festival dates.  The old
first_help_day / last_help_day columns on people are removed; they were never
populated in production so no data migration is required.

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
    op.create_index(
        "ix_volunteer_periods_volunteer_id", "volunteer_periods", ["volunteer_id"]
    )
    op.create_index(
        "ix_volunteer_periods_first_help_day", "volunteer_periods", ["first_help_day"]
    )

    with op.batch_alter_table("people") as batch_op:
        batch_op.drop_column("first_help_day")
        batch_op.drop_column("last_help_day")


def downgrade() -> None:
    with op.batch_alter_table("people") as batch_op:
        batch_op.add_column(sa.Column("first_help_day", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("last_help_day", sa.Date(), nullable=True))

    op.drop_index("ix_volunteer_periods_first_help_day", table_name="volunteer_periods")
    op.drop_index("ix_volunteer_periods_volunteer_id", table_name="volunteer_periods")
    op.drop_table("volunteer_periods")
