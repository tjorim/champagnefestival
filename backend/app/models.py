"""SQLAlchemy ORM models."""

import json
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(50))
    event_id: Mapped[str] = mapped_column(String(100))
    event_title: Mapped[str] = mapped_column(String(200))
    guest_count: Mapped[int] = mapped_column(Integer)
    # JSON-encoded list of OrderItem dicts
    pre_orders: Mapped[str] = mapped_column(Text, default="[]")
    notes: Mapped[str] = mapped_column(Text, default="")
    accessibility_note: Mapped[str] = mapped_column(Text, default="")
    """Optional accessibility requirements for the guest (wheelchair, low table, etc.)."""

    person_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("people.id", ondelete="SET NULL"), nullable=True
    )
    table_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[str] = mapped_column(String(20), default="pending")
    """pending | confirmed | cancelled"""

    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    """unpaid | partial | paid"""

    checked_in: Mapped[bool] = mapped_column(Boolean, default=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    strap_issued: Mapped[bool] = mapped_column(Boolean, default=False)
    check_in_token: Mapped[str] = mapped_column(String(64), unique=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def get_pre_orders(self) -> list[dict]:
        return json.loads(self.pre_orders) if self.pre_orders else []

    def set_pre_orders(self, items: list[dict]) -> None:
        self.pre_orders = json.dumps(items)


class Producer(Base):
    """A champagne producer participating in the festival."""

    __tablename__ = "producers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    image: Mapped[str] = mapped_column(String(500), default="")
    website: Mapped[str] = mapped_column(String(500), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    contact_person_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("people.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Sponsor(Base):
    """A sponsor of the festival."""

    __tablename__ = "sponsors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    image: Mapped[str] = mapped_column(String(500), default="")
    website: Mapped[str] = mapped_column(String(500), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    contact_person_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("people.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Exhibitor(Base):
    """A vendor that is not a champagne producer and does not financially sponsor the festival."""

    __tablename__ = "exhibitors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    image: Mapped[str] = mapped_column(String(500), default="")
    website: Mapped[str] = mapped_column(String(500), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    contact_person_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("people.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Venue(Base):
    """A physical venue where the festival takes place."""

    __tablename__ = "venues"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    postal_code: Mapped[str] = mapped_column(String(20), default="")
    country: Mapped[str] = mapped_column(String(100), default="")
    lat: Mapped[float] = mapped_column(Float, default=0.0)
    lng: Mapped[float] = mapped_column(Float, default=0.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Room(Base):
    """A physical space within a venue.

    Width and length are stored in metres so the frontend can render a
    proportional canvas.
    """

    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    venue_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False
    )
    """FK to the Venue this room belongs to."""

    width_m: Mapped[float] = mapped_column(default=20.0)
    """Room width in metres — used to render a proportional canvas."""

    length_m: Mapped[float] = mapped_column(default=15.0)
    """Room length in metres."""

    color: Mapped[str] = mapped_column(String(20), default="#6c757d")
    """Accent colour for the room badge / canvas border (CSS colour string)."""

    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Layout(Base):
    """A named floor-plan snapshot for a specific room and festival day.

    Each snapshot captures the table configuration for one room on one of the
    three festival days (Friday=1, Saturday=2, Sunday=3), allowing managers
    to maintain different floor plans per day and restore previous versions.
    """

    __tablename__ = "layouts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    edition_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="SET NULL"), nullable=True
    )
    room_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False
    )
    day_id: Mapped[int] = mapped_column(Integer)
    """1 = Friday, 2 = Saturday, 3 = Sunday."""

    label: Mapped[str] = mapped_column(String(200), default="")
    """Human-readable version label, e.g. 'pre-event', 'after cancellations'."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class TableType(Base):
    """Physical template for a table (shape, dimensions, height, max seats)."""

    __tablename__ = "table_types"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    shape: Mapped[str] = mapped_column(String(20), default="rectangle")
    """'rectangle' | 'round'"""
    width_m: Mapped[float] = mapped_column(default=0.7)
    """Width in metres (diameter for round tables)."""
    length_m: Mapped[float] = mapped_column(default=1.8)
    """Length in metres (equals width_m for round tables)."""
    height_type: Mapped[str] = mapped_column(String(20), default="low")
    """'low' | 'high'"""
    max_capacity: Mapped[int] = mapped_column(Integer)
    """Physical maximum number of seats for this table shape/size."""
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    capacity: Mapped[int] = mapped_column(Integer)
    # Position as percentage of room dimensions (0-100)
    x: Mapped[float] = mapped_column(default=50.0)
    y: Mapped[float] = mapped_column(default=50.0)
    table_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("table_types.id", ondelete="RESTRICT"), nullable=False
    )
    """FK to the TableType template that defines this table's shape and dimensions."""

    rotation: Mapped[int] = mapped_column(Integer, default=0)
    """Rotation angle in whole degrees [0, 359], clockwise."""

    layout_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False
    )
    """FK to the Layout this table belongs to."""

    # JSON-encoded list of reservation ID strings
    reservation_ids: Mapped[str] = mapped_column(Text, default="[]")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def get_reservation_ids(self) -> list[str]:
        return json.loads(self.reservation_ids) if self.reservation_ids else []

    def set_reservation_ids(self, ids: list[str]) -> None:
        self.reservation_ids = json.dumps(ids)


class Area(Base):
    """A non-seating zone on the floor plan (stand, stage, catering, etc.)."""

    __tablename__ = "areas"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    layout_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False
    )
    producer_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("producers.id", ondelete="SET NULL"), nullable=True
    )
    sponsor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("sponsors.id", ondelete="SET NULL"), nullable=True
    )
    exhibitor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("exhibitors.id", ondelete="SET NULL"), nullable=True
    )
    label: Mapped[str] = mapped_column(String(200))
    icon: Mapped[str] = mapped_column(String(50), default="bi-shop")
    """Bootstrap Icons class name, e.g. 'bi-shop', 'bi-music-note-beamed'."""

    x: Mapped[float] = mapped_column(default=50.0)
    y: Mapped[float] = mapped_column(default=50.0)
    rotation: Mapped[int] = mapped_column(Integer, default=0)
    width_m: Mapped[float] = mapped_column(default=1.5)
    length_m: Mapped[float] = mapped_column(default=1.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Edition(Base):
    """A festival edition (e.g. 2026-march).

    Stores the dates of the three festival days, venue information, and a
    JSON-encoded schedule of events.
    """

    __tablename__ = "editions"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    """Slug-style identifier, e.g. '2026-march'."""

    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[str] = mapped_column(String(20))
    friday: Mapped[date] = mapped_column(Date)
    saturday: Mapped[date] = mapped_column(Date)
    sunday: Mapped[date] = mapped_column(Date)

    venue_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False
    )

    # JSON-encoded list of schedule event dicts
    schedule: Mapped[str] = mapped_column(Text, default="[]")

    # JSON-encoded lists of producer/sponsor IDs participating in this edition
    producers: Mapped[str] = mapped_column(Text, default="[]")
    sponsors: Mapped[str] = mapped_column(Text, default="[]")

    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def get_schedule(self) -> list[dict]:
        return json.loads(self.schedule) if self.schedule else []

    def set_schedule(self, events: list[dict]) -> None:
        self.schedule = json.dumps(events)

    def get_producers(self) -> list[int]:
        return json.loads(self.producers) if self.producers else []

    def set_producers(self, ids: list[int]) -> None:
        self.producers = json.dumps(ids)

    def get_sponsors(self) -> list[int]:
        return json.loads(self.sponsors) if self.sponsors else []

    def set_sponsors(self, ids: list[int]) -> None:
        self.sponsors = json.dumps(ids)


class Person(Base):
    """Unified person entity used for members, volunteers, and visitors."""

    __tablename__ = "people"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    # JSON-encoded list of role strings: volunteer, chairwoman, treasurer,
    # member, festival-visitor, ...
    roles: Mapped[str] = mapped_column(Text, default="[]")

    # Optional compliance/attendance fields
    first_help_day: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_help_day: Mapped[date | None] = mapped_column(Date, nullable=True)
    national_register_number: Mapped[str | None] = mapped_column(
        String(20), unique=True, nullable=True
    )
    eid_document_number: Mapped[str | None] = mapped_column(
        String(50), unique=True, nullable=True
    )

    # Optional club/visitor metadata
    visits_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    club_name: Mapped[str] = mapped_column(String(200), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def get_roles(self) -> list[str]:
        return json.loads(self.roles) if self.roles else []

    def set_roles(self, roles: list[str]) -> None:
        self.roles = json.dumps(roles)
