"""Add rooms table and room_id column to tables.

Revision ID: 003
Revises: 002
Create Date: 2026-03-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("zone_type", sa.String(50), nullable=False, server_default="main-hall"),
        sa.Column("width_m", sa.Float, nullable=False, server_default="20.0"),
        sa.Column("height_m", sa.Float, nullable=False, server_default="15.0"),
        sa.Column("color", sa.String(20), nullable=False, server_default="#6c757d"),
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

    with op.batch_alter_table("tables") as batch_op:
        batch_op.add_column(sa.Column("room_id", sa.String(64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tables") as batch_op:
        batch_op.drop_column("room_id")
    op.drop_table("rooms")
