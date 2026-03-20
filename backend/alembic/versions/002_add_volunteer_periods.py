"""Add volunteer periods table.

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
    bind = op.get_bind()

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

    role_filter = (
        "roles::jsonb @> '[\"volunteer\"]'::jsonb"
        if bind.dialect.name == "postgresql"
        else """EXISTS (
              SELECT 1
              FROM json_each(people.roles)
              WHERE json_each.value = 'volunteer'
            )"""
    )

    op.execute(
        sa.text(
            f"""
            INSERT INTO volunteer_periods (volunteer_id, first_help_day, last_help_day, created_at, updated_at)
            SELECT id, first_help_day, last_help_day, created_at, updated_at
            FROM people
            WHERE first_help_day IS NOT NULL
              AND {role_filter}
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE people
            SET
              first_help_day = (
                SELECT MIN(vp.first_help_day)
                FROM volunteer_periods AS vp
                WHERE vp.volunteer_id = people.id
              ),
              last_help_day = (
                SELECT MAX(vp.last_help_day)
                FROM volunteer_periods AS vp
                WHERE vp.volunteer_id = people.id
              )
            WHERE EXISTS (
              SELECT 1
              FROM volunteer_periods AS vp
              WHERE vp.volunteer_id = people.id
            )
            """
        )
    )
    op.drop_index("ix_volunteer_periods_first_help_day", table_name="volunteer_periods")
    op.drop_index("ix_volunteer_periods_volunteer_id", table_name="volunteer_periods")
    op.drop_table("volunteer_periods")
