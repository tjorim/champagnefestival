"""Initial schema — all tables.

Revision ID: 001
Revises:
Create Date: 2026-03-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # venues must be created before rooms so the FK reference is valid
    op.create_table(
        "venues",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.String(200), nullable=False, server_default=""),
        sa.Column("city", sa.String(100), nullable=False, server_default=""),
        sa.Column("postal_code", sa.String(20), nullable=False, server_default=""),
        sa.Column("country", sa.String(100), nullable=False, server_default=""),
        sa.Column("lat", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("lng", sa.Float, nullable=False, server_default="0.0"),
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

    # rooms must be created before layouts so the FK reference is valid
    op.create_table(
        "rooms",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "venue_id",
            sa.String(64),
            sa.ForeignKey("venues.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("width_m", sa.Float, nullable=False, server_default="20.0"),
        sa.Column("length_m", sa.Float, nullable=False, server_default="15.0"),
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

    op.create_table(
        "table_types",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("shape", sa.String(20), nullable=False, server_default="rectangle"),
        sa.Column("width_m", sa.Float, nullable=False, server_default="0.7"),
        sa.Column("length_m", sa.Float, nullable=False, server_default="1.8"),
        sa.Column("height_type", sa.String(20), nullable=False, server_default="low"),
        sa.Column("max_capacity", sa.Integer, nullable=False),
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

    # editions must be created before layouts so the FK reference is valid
    op.create_table(
        "editions",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.String(20), nullable=False),
        sa.Column("friday", sa.Date, nullable=False),
        sa.Column("saturday", sa.Date, nullable=False),
        sa.Column("sunday", sa.Date, nullable=False),
        sa.Column(
            "venue_id",
            sa.String(64),
            sa.ForeignKey("venues.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("schedule", sa.Text, nullable=False, server_default="[]"),
        sa.Column("producers", sa.Text, nullable=False, server_default="[]"),
        sa.Column("sponsors", sa.Text, nullable=False, server_default="[]"),
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

    # layouts must be created before tables so the FK reference is valid
    op.create_table(
        "layouts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "edition_id",
            sa.String(100),
            sa.ForeignKey("editions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "room_id",
            sa.String(64),
            sa.ForeignKey("rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day_id", sa.Integer, nullable=False),
        sa.Column("label", sa.String(200), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # tables must be created before reservations so the FK reference is valid
    op.create_table(
        "tables",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("capacity", sa.Integer, nullable=False),
        sa.Column("x", sa.Float, nullable=False, server_default="50.0"),
        sa.Column("y", sa.Float, nullable=False, server_default="50.0"),
        sa.Column(
            "table_type_id",
            sa.String(64),
            sa.ForeignKey("table_types.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("reservation_ids", sa.Text, nullable=False, server_default="[]"),
        sa.Column("rotation", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "layout_id",
            sa.String(64),
            sa.ForeignKey("layouts.id", ondelete="CASCADE"),
            nullable=False,
        ),
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
        "people",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("person_key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("phone", sa.String(length=50), nullable=False, server_default=""),
        sa.Column("address", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("roles", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("first_help_day", sa.Date(), nullable=True),
        sa.Column("last_help_day", sa.Date(), nullable=True),
        sa.Column("national_register_number", sa.String(length=20), nullable=True),
        sa.Column("eid_document_number", sa.String(length=50), nullable=True),
        sa.Column("visits_per_month", sa.Integer(), nullable=True),
        sa.Column("club_name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("person_key"),
        sa.UniqueConstraint("national_register_number"),
        sa.UniqueConstraint("eid_document_number"),
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
        sa.Column("accessibility_note", sa.Text, nullable=False, server_default=""),
        sa.Column(
            "table_id",
            sa.String(64),
            sa.ForeignKey("tables.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "person_id",
            sa.String(64),
            sa.ForeignKey("people.id", ondelete="SET NULL"),
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

    op.create_table(
        "content_items",
        sa.Column("key", sa.String(50), primary_key=True),
        sa.Column("value", sa.Text, nullable=False, server_default="[]"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("content_items")
    op.drop_table("reservations")
    op.drop_table("people")
    op.drop_table("tables")
    op.drop_table("table_types")
    op.drop_table("layouts")
    op.drop_table("editions")
    op.drop_table("rooms")
    op.drop_table("venues")
