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


def _event_id(edition_id: str, raw_id: str | None, index: int) -> str:
    seed = f"{edition_id}:{raw_id or index}".encode("utf-8")
    digest = hashlib.sha1(seed).hexdigest()[:16]
    prefix = (raw_id or f"event-{index + 1}").replace(" ", "-")[:32]
    return f"evt-{prefix}-{digest}"[:64]


def _day_to_date(row, day_id):
    mapping = {
        1: row.friday,
        2: row.saturday,
        3: row.sunday,
    }
    return mapping.get(day_id) or row.friday


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = inspector.get_table_names()

    edition_cols = {col["name"] for col in inspector.get_columns("editions")}
    with op.batch_alter_table("editions") as batch_op:
        if "edition_type" not in edition_cols:
            batch_op.add_column(
                sa.Column(
                    "edition_type",
                    sa.String(length=20),
                    nullable=False,
                    server_default="festival",
                )
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
            sa.Column("location", sa.String(200), nullable=True),
            sa.Column("presenter", sa.String(200), nullable=True),
            sa.Column("registration_required", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("registrations_open_from", sa.DateTime(timezone=True), nullable=True),
            sa.Column("max_capacity", sa.Integer(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    event_rows: list[dict] = []
    if "schedule" in edition_cols:
        editions = bind.execute(
            sa.text(
                "SELECT id, friday, saturday, sunday, schedule FROM editions"
            )
        ).fetchall()
        now = _utcnow()
        for row in editions:
            schedule = _normalise_schedule(row.schedule)
            for index, item in enumerate(schedule):
                if not isinstance(item, dict):
                    continue
                day_id = item.get("day_id")
                event_rows.append(
                    {
                        "id": _event_id(row.id, item.get("id"), index),
                        "edition_id": row.id,
                        "title": item.get("title") or f"Event {index + 1}",
                        "description": item.get("description") or "",
                        "date": _day_to_date(row, day_id),
                        "start_time": item.get("start_time") or "00:00",
                        "end_time": item.get("end_time"),
                        "category": item.get("category") or "general",
                        "location": item.get("location"),
                        "presenter": item.get("presenter"),
                        "registration_required": bool(item.get("registration") or item.get("registration_required")),
                        "registrations_open_from": item.get("reservations_open_from") or item.get("registrations_open_from"),
                        "max_capacity": item.get("max_capacity"),
                        "sort_order": index,
                        "active": bool(item.get("active", True)),
                        "created_at": now,
                        "updated_at": now,
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
                sa.column("location", sa.String),
                sa.column("presenter", sa.String),
                sa.column("registration_required", sa.Boolean),
                sa.column("registrations_open_from", sa.DateTime(timezone=True)),
                sa.column("max_capacity", sa.Integer),
                sa.column("sort_order", sa.Integer),
                sa.column("active", sa.Boolean),
                sa.column("created_at", sa.DateTime(timezone=True)),
                sa.column("updated_at", sa.DateTime(timezone=True)),
            ),
            event_rows,
        )

    if "reservations" in existing_tables and "registrations" not in existing_tables:
        op.rename_table("reservations", "registrations")

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
    if "schedule" in edition_cols:
        with op.batch_alter_table("editions") as batch_op:
            batch_op.drop_column("schedule")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    edition_cols = {col["name"] for col in inspector.get_columns("editions")}
    if "schedule" not in edition_cols:
        with op.batch_alter_table("editions") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "schedule",
                    sa.JSON(),
                    nullable=False,
                    server_default=sa.text("'[]'"),
                )
            )

    editions = {
        row.id: row
        for row in bind.execute(
            sa.text("SELECT id, friday, saturday, sunday FROM editions")
        ).fetchall()
    }
    events = bind.execute(
        sa.text(
            "SELECT id, edition_id, title, description, date, start_time, end_time, category, location, presenter, registration_required, registrations_open_from, sort_order, active FROM events ORDER BY edition_id, sort_order, date, start_time"
        )
    ).fetchall()
    schedules: dict[str, list[dict]] = {edition_id: [] for edition_id in editions}
    for row in events:
        edition = editions.get(row.edition_id)
        if edition is None:
            continue
        if row.date == edition.friday:
            day_id = 1
        elif row.date == edition.saturday:
            day_id = 2
        elif row.date == edition.sunday:
            day_id = 3
        else:
            day_id = 1
        schedules.setdefault(row.edition_id, []).append(
            {
                "id": row.id,
                "title": row.title,
                "start_time": row.start_time,
                "end_time": row.end_time,
                "description": row.description or "",
                "reservation": bool(row.registration_required),
                "reservations_open_from": row.registrations_open_from.isoformat() if row.registrations_open_from else None,
                "location": row.location,
                "presenter": row.presenter,
                "category": row.category,
                "day_id": day_id,
            }
        )
    for edition_id, schedule in schedules.items():
        bind.execute(
            sa.text("UPDATE editions SET schedule = :schedule WHERE id = :edition_id"),
            {"edition_id": edition_id, "schedule": json.dumps(schedule)},
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
