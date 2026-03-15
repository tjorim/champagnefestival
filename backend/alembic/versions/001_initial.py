"""Initial schema — reservations and tables.

Revision ID: 001
Revises:
Create Date: 2026-03-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # tables must be created before reservations so the FK reference is valid
    op.create_table(
        "tables",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("capacity", sa.Integer, nullable=False),
        sa.Column("x", sa.Float, nullable=False, server_default="50.0"),
        sa.Column("y", sa.Float, nullable=False, server_default="50.0"),
        sa.Column("reservation_ids", sa.Text, nullable=False, server_default="[]"),
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

    op.create_table(
        "reservations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(50), nullable=False),
        sa.Column("event_id", sa.String(100), nullable=False),
        sa.Column("event_title", sa.String(200), nullable=False),
        sa.Column("guest_count", sa.Integer, nullable=False),
        sa.Column("pre_orders", sa.Text, nullable=False, server_default="[]"),
        sa.Column("notes", sa.Text, nullable=False, server_default=""),
        sa.Column(
            "table_id",
            sa.String(64),
            sa.ForeignKey("tables.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("payment_status", sa.String(20), nullable=False, server_default="unpaid"),
        sa.Column("checked_in", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("strap_issued", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("check_in_token", sa.String(64), nullable=False, unique=True),
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
    op.drop_table("reservations")
    op.drop_table("tables")
