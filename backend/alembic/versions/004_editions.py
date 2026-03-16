"""Add editions table.

Revision ID: 004
Revises: 003
Create Date: 2026-03-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "editions",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.String(20), nullable=False),
        sa.Column("friday", sa.Date, nullable=False),
        sa.Column("saturday", sa.Date, nullable=False),
        sa.Column("sunday", sa.Date, nullable=False),
        sa.Column("venue_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("venue_address", sa.String(200), nullable=False, server_default=""),
        sa.Column("venue_city", sa.String(100), nullable=False, server_default=""),
        sa.Column("venue_postal_code", sa.String(20), nullable=False, server_default=""),
        sa.Column("venue_country", sa.String(100), nullable=False, server_default=""),
        sa.Column("venue_lat", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("venue_lng", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("schedule", sa.Text, nullable=False, server_default="[]"),
        sa.Column("active", sa.Boolean, nullable=False, server_default="1"),
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


def downgrade() -> None:
    op.drop_table("editions")
