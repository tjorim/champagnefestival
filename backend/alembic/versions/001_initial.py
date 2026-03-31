"""Create initial schema.

Revision ID: 001
Revises:
Create Date: 2026-03-31
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(200), nullable=False, server_default=""),
        sa.Column("phone", sa.String(50), nullable=False, server_default=""),
        sa.Column("address", sa.String(300), nullable=False, server_default=""),
        sa.Column("roles", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("national_register_number", sa.String(20), unique=True, nullable=True),
        sa.Column("eid_document_number", sa.String(50), unique=True, nullable=True),
        sa.Column("visits_per_month", sa.Integer(), nullable=True),
        sa.Column("club_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "venues",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.String(200), nullable=False, server_default=""),
        sa.Column("city", sa.String(100), nullable=False, server_default=""),
        sa.Column("postal_code", sa.String(20), nullable=False, server_default=""),
        sa.Column("country", sa.String(100), nullable=False, server_default=""),
        sa.Column("lat", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("lng", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "exhibitors",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("image", sa.String(500), nullable=False, server_default=""),
        sa.Column("website", sa.String(500), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("type", sa.String(20), nullable=False, server_default="vendor"),
        sa.Column("contact_person_id", sa.String(64), sa.ForeignKey("people.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "editions",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.String(20), nullable=False),
        sa.Column("venue_id", sa.String(64), sa.ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("edition_type", sa.String(20), nullable=False, server_default="festival"),
        sa.Column("external_partner", sa.String(200), nullable=True),
        sa.Column("external_contact_name", sa.String(200), nullable=True),
        sa.Column("external_contact_email", sa.String(200), nullable=True),
        sa.Column("exhibitors", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.String(10), nullable=False),
        sa.Column("end_time", sa.String(10), nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("registration_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("registrations_open_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_capacity", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_events_edition_id", "events", ["edition_id"])
    op.create_index("ix_events_date", "events", ["date"])
    op.create_index("ix_events_active", "events", ["active"])

    op.create_table(
        "rooms",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("venue_id", sa.String(64), sa.ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("width_m", sa.Float(), nullable=False, server_default="20.0"),
        sa.Column("length_m", sa.Float(), nullable=False, server_default="15.0"),
        sa.Column("color", sa.String(20), nullable=False, server_default="#6c757d"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "table_types",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("shape", sa.String(20), nullable=False, server_default="rectangle"),
        sa.Column("width_m", sa.Float(), nullable=False, server_default="0.7"),
        sa.Column("length_m", sa.Float(), nullable=False, server_default="1.8"),
        sa.Column("height_type", sa.String(20), nullable=False, server_default="low"),
        sa.Column("max_capacity", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "layouts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("room_id", sa.String(64), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(200), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "tables",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("x", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("y", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("table_type_id", sa.String(64), sa.ForeignKey("table_types.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("rotation", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("layout_id", sa.String(64), sa.ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reservation_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "registrations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("event_id", sa.String(64), sa.ForeignKey("events.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("guest_count", sa.Integer(), nullable=False),
        sa.Column("pre_orders", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("accessibility_note", sa.Text(), nullable=False, server_default=""),
        sa.Column("person_id", sa.String(64), sa.ForeignKey("people.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("table_id", sa.String(64), sa.ForeignKey("tables.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("payment_status", sa.String(20), nullable=False, server_default="unpaid"),
        sa.Column("checked_in", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("strap_issued", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("check_in_token", sa.String(64), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_registrations_person_id", "registrations", ["person_id"])
    op.create_index("ix_registrations_event_id", "registrations", ["event_id"])
    op.create_index("ix_registrations_status", "registrations", ["status"])
    op.create_index("ix_registrations_table_id", "registrations", ["table_id"])

    op.create_table(
        "reservation_access_tokens",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(200), unique=True, nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "areas",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("layout_id", sa.String(64), sa.ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exhibitor_id", sa.Integer(), sa.ForeignKey("exhibitors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("icon", sa.String(50), nullable=False, server_default="bi-shop"),
        sa.Column("x", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("y", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("rotation", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("width_m", sa.Float(), nullable=False, server_default="1.5"),
        sa.Column("length_m", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "volunteer_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("volunteer_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("first_help_day", sa.Date(), nullable=False),
        sa.Column("last_help_day", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("volunteer_periods")
    op.drop_table("areas")
    op.drop_table("reservation_access_tokens")
    op.drop_index("ix_registrations_table_id", table_name="registrations")
    op.drop_index("ix_registrations_status", table_name="registrations")
    op.drop_index("ix_registrations_event_id", table_name="registrations")
    op.drop_index("ix_registrations_person_id", table_name="registrations")
    op.drop_table("registrations")
    op.drop_table("tables")
    op.drop_table("layouts")
    op.drop_table("table_types")
    op.drop_table("rooms")
    op.drop_index("ix_events_active", table_name="events")
    op.drop_index("ix_events_date", table_name="events")
    op.drop_index("ix_events_edition_id", table_name="events")
    op.drop_table("events")
    op.drop_table("editions")
    op.drop_table("exhibitors")
    op.drop_table("venues")
    op.drop_table("people")
