"""Unify edition schedule data into relational events and registrations.

Revision ID: 003
Revises: 002
Create Date: 2026-03-21
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalise_schedule(value):
    if value in (None, ""):
        return []
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return []
    return value if isinstance(value, list) else []


def _event_id(edition_id: str, schedule_item_id: str | None, index: int) -> str:
    """Return the migrated event ID for one legacy schedule item.

    If the old JSON schedule entry already had an ``id``, we preserve it so any
    pre-existing reservation/registration rows that still point at that legacy
    schedule ID continue to resolve after the FK is added. Only schedule items
    without an ID get a generated ``evt-...`` identifier.
    """
    if schedule_item_id:
        preserved_schedule_id = str(schedule_item_id).strip()
        if preserved_schedule_id:
            return preserved_schedule_id[:64]
    seed = f"{edition_id}:{schedule_item_id or index}".encode("utf-8")
    digest = hashlib.sha1(seed).hexdigest()[:16]
    prefix = (schedule_item_id or f"event-{index + 1}").replace(" ", "-")[:32]
    return f"evt-{prefix}-{digest}"[:64]


def _day_to_date(row, day_id):
    mapping = {1: row.friday, 2: row.saturday, 3: row.sunday}
    return mapping.get(day_id) or row.friday or row.saturday or row.sunday


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = inspector.get_table_names()

    edition_cols = {col["name"] for col in inspector.get_columns("editions")}
    with op.batch_alter_table("editions") as batch_op:
        if "edition_type" not in edition_cols:
            batch_op.add_column(
                sa.Column("edition_type", sa.String(length=20), nullable=False, server_default="festival")
            )
        if "external_partner" not in edition_cols:
            batch_op.add_column(sa.Column("external_partner", sa.String(length=200), nullable=True))
        if "external_contact_name" not in edition_cols:
            batch_op.add_column(sa.Column("external_contact_name", sa.String(length=200), nullable=True))
        if "external_contact_email" not in edition_cols:
            batch_op.add_column(sa.Column("external_contact_email", sa.String(length=200), nullable=True))

    if "events" not in existing_tables:
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

    event_rows: list[dict] = []
    schedule_id_remaps: list[dict[str, str]] = []
    if {"schedule", "friday", "saturday", "sunday"}.issubset(edition_cols):
        editions = bind.execute(
            sa.text("SELECT id, friday, saturday, sunday, schedule FROM editions")
        ).fetchall()
        now = _utcnow()
        for row in editions:
            schedule = _normalise_schedule(row.schedule)
            for index, item in enumerate(schedule):
                if not isinstance(item, dict):
                    continue
                schedule_item_id = item.get("id")
                event_id = _event_id(row.id, schedule_item_id, index)
                event_rows.append(
                    {
                        "id": event_id,
                        "edition_id": row.id,
                        "title": item.get("title") or f"Event {index + 1}",
                        "description": item.get("description") or "",
                        "date": _day_to_date(row, item.get("day_id")),
                        "start_time": item.get("start_time") or "00:00",
                        "end_time": item.get("end_time"),
                        "category": item.get("category") or "general",
                        "registration_required": bool(item.get("registration") or item.get("registration_required")),
                        "registrations_open_from": item.get("reservations_open_from") or item.get("registrations_open_from"),
                        "max_capacity": item.get("max_capacity"),
                        "active": bool(item.get("active", True)),
                        "created_at": now,
                        "updated_at": now,
                    }
                )
                if schedule_item_id and event_id != schedule_item_id:
                    schedule_id_remaps.append(
                        {
                            "schedule_item_id": str(schedule_item_id),
                            "event_id": event_id,
                        }
                    )
    if event_rows:
        op.bulk_insert(
            sa.table(
                "events",
                sa.column("id", sa.String),
                sa.column("edition_id", sa.String),
                sa.column("title", sa.String),
                sa.column("description", sa.Text),
                sa.column("date", sa.Date),
                sa.column("start_time", sa.String),
                sa.column("end_time", sa.String),
                sa.column("category", sa.String),
                sa.column("registration_required", sa.Boolean),
                sa.column("registrations_open_from", sa.DateTime(timezone=True)),
                sa.column("max_capacity", sa.Integer),
                sa.column("active", sa.Boolean),
                sa.column("created_at", sa.DateTime(timezone=True)),
                sa.column("updated_at", sa.DateTime(timezone=True)),
            ),
            event_rows,
        )

    if "reservations" in existing_tables and "registrations" not in existing_tables:
        op.rename_table("reservations", "registrations")

    if schedule_id_remaps:
        for mapping in schedule_id_remaps:
            bind.execute(
                sa.text(
                    "UPDATE registrations SET event_id = :event_id WHERE event_id = :schedule_item_id"
                ),
                mapping,
            )

    registration_indexes = {index["name"] for index in inspect(bind).get_indexes("registrations")}
    for old_name in (
        "ix_reservations_person_id",
        "ix_reservations_event_id",
        "ix_reservations_status",
        "ix_reservations_table_id",
    ):
        if old_name in registration_indexes:
            op.drop_index(old_name, table_name="registrations")

    registration_cols = {col["name"] for col in inspect(bind).get_columns("registrations")}
    with op.batch_alter_table("registrations") as batch_op:
        if "event_title" in registration_cols:
            batch_op.drop_column("event_title")
        batch_op.alter_column("event_id", existing_type=sa.String(length=100), type_=sa.String(length=64))
        batch_op.create_foreign_key(
            "fk_registrations_event_id_events",
            "events",
            ["event_id"],
            ["id"],
            ondelete="RESTRICT",
        )

    op.create_index("ix_events_edition_id", "events", ["edition_id"])
    op.create_index("ix_events_date", "events", ["date"])
    op.create_index("ix_events_active", "events", ["active"])
    op.create_index("ix_registrations_person_id", "registrations", ["person_id"])
    op.create_index("ix_registrations_event_id", "registrations", ["event_id"])
    op.create_index("ix_registrations_status", "registrations", ["status"])
    op.create_index("ix_registrations_table_id", "registrations", ["table_id"])

    edition_cols = {col["name"] for col in inspect(bind).get_columns("editions")}
    with op.batch_alter_table("editions") as batch_op:
        if "schedule" in edition_cols:
            batch_op.drop_column("schedule")
        if "friday" in edition_cols:
            batch_op.drop_column("friday")
        if "saturday" in edition_cols:
            batch_op.drop_column("saturday")
        if "sunday" in edition_cols:
            batch_op.drop_column("sunday")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    edition_cols = {col["name"] for col in inspector.get_columns("editions")}
    with op.batch_alter_table("editions") as batch_op:
        if "schedule" not in edition_cols:
            batch_op.add_column(sa.Column("schedule", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
        if "friday" not in edition_cols:
            batch_op.add_column(sa.Column("friday", sa.Date(), nullable=True))
        if "saturday" not in edition_cols:
            batch_op.add_column(sa.Column("saturday", sa.Date(), nullable=True))
        if "sunday" not in edition_cols:
            batch_op.add_column(sa.Column("sunday", sa.Date(), nullable=True))

    events = bind.execute(
        sa.text(
            "SELECT id, edition_id, title, description, date, start_time, end_time, category, registration_required, registrations_open_from FROM events ORDER BY edition_id, date, start_time, id"
        )
    ).fetchall()
    events_by_edition: dict[str, list] = {}
    for row in events:
        events_by_edition.setdefault(row.edition_id, []).append(row)

    for edition_id, rows in events_by_edition.items():
        unique_dates = sorted({row.date for row in rows if row.date is not None})
        if not unique_dates:
            friday = saturday = sunday = None
        elif len(unique_dates) == 1:
            friday = saturday = sunday = unique_dates[0]
        elif len(unique_dates) == 2:
            friday, saturday = unique_dates
            sunday = saturday
        else:
            friday, saturday, sunday = unique_dates[:3]

        day_map = {friday: 1, saturday: 2, sunday: 3}
        schedule = []
        for row in rows:
            schedule.append(
                {
                    "id": row.id,
                    "title": row.title,
                    "start_time": row.start_time,
                    "end_time": row.end_time,
                    "description": row.description or "",
                    "reservation": bool(row.registration_required),
                    "reservations_open_from": row.registrations_open_from.isoformat() if row.registrations_open_from else None,
                    "category": row.category,
                    "day_id": day_map.get(row.date, 1),
                }
            )

        bind.execute(
            sa.text(
                "UPDATE editions SET friday = :friday, saturday = :saturday, sunday = :sunday, schedule = :schedule WHERE id = :edition_id"
            ),
            {
                "edition_id": edition_id,
                "friday": friday,
                "saturday": saturday,
                "sunday": sunday,
                "schedule": json.dumps(schedule),
            },
        )

    registration_indexes = {index["name"] for index in inspector.get_indexes("registrations")}
    for name in (
        "ix_registrations_person_id",
        "ix_registrations_event_id",
        "ix_registrations_status",
        "ix_registrations_table_id",
    ):
        if name in registration_indexes:
            op.drop_index(name, table_name="registrations")

    registration_cols = {col["name"] for col in inspect(bind).get_columns("registrations")}
    with op.batch_alter_table("registrations") as batch_op:
        if "event_title" not in registration_cols:
            batch_op.add_column(sa.Column("event_title", sa.String(length=200), nullable=False, server_default=""))
        batch_op.drop_constraint("fk_registrations_event_id_events", type_="foreignkey")
        batch_op.alter_column("event_id", existing_type=sa.String(length=64), type_=sa.String(length=100))

    bind.execute(
        sa.text(
            "UPDATE registrations SET event_title = COALESCE((SELECT title FROM events WHERE events.id = registrations.event_id), '')"
        )
    )

    op.create_index("ix_reservations_person_id", "registrations", ["person_id"])
    op.create_index("ix_reservations_event_id", "registrations", ["event_id"])
    op.create_index("ix_reservations_status", "registrations", ["status"])
    op.create_index("ix_reservations_table_id", "registrations", ["table_id"])

    op.drop_index("ix_events_active", table_name="events")
    op.drop_index("ix_events_date", table_name="events")
    op.drop_index("ix_events_edition_id", table_name="events")
    op.drop_table("events")

    if "registrations" in inspect(bind).get_table_names():
        op.rename_table("registrations", "reservations")

    edition_cols = {col["name"] for col in inspect(bind).get_columns("editions")}
    with op.batch_alter_table("editions") as batch_op:
        if "edition_type" in edition_cols:
            batch_op.drop_column("edition_type")
        if "external_partner" in edition_cols:
            batch_op.drop_column("external_partner")
        if "external_contact_name" in edition_cols:
            batch_op.drop_column("external_contact_name")
        if "external_contact_email" in edition_cols:
            batch_op.drop_column("external_contact_email")
