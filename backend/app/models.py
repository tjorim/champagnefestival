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


class ContentItem(Base):
    """Key-value store for CMS-managed content (producers, sponsors).

    Each row stores a JSON array under a named key.  Keys are restricted to a
    known set at the API layer; arbitrary keys are rejected.
    """

    __tablename__ = "content_items"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    """Identifier, e.g. 'producers' or 'sponsors'."""

    value: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    """JSON-encoded list of SliderItem objects."""

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def get_items(self) -> list[dict]:
        return json.loads(self.value) if self.value else []

    def set_items(self, items: list[dict]) -> None:
        self.value = json.dumps(items)


class Room(Base):
    """A physical space within the venue.

    Width and height are stored in metres so the frontend can render a
    proportional canvas.
    """

    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))

    width_m: Mapped[float] = mapped_column(default=20.0)
    """Room width in metres — used to render a proportional canvas."""

    length_m: Mapped[float] = mapped_column(default=15.0)
    """Room length in metres."""

    color: Mapped[str] = mapped_column(String(20), default="#6c757d")
    """Accent colour for the room badge / canvas border (CSS colour string)."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    capacity: Mapped[int] = mapped_column(Integer)
    # Position as percentage of room dimensions (0-100)
    x: Mapped[float] = mapped_column(default=50.0)
    y: Mapped[float] = mapped_column(default=50.0)
    # Optional room assignment (nullable for backward compat)
    room_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    shape: Mapped[str] = mapped_column(String(20), default="rectangle")
    """'rectangle' | 'round'"""
    width_m: Mapped[float] = mapped_column(default=1.8)
    """Physical width in metres (for round tables: diameter)."""

    length_m: Mapped[float] = mapped_column(default=0.7)
    """Physical length in metres (second tabletop dimension; for round tables: same as width_m)."""

    rotation: Mapped[int] = mapped_column(Integer, default=0)
    """Rotation angle in whole degrees [0, 359], clockwise."""

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

    venue_name: Mapped[str] = mapped_column(String(200), default="")
    venue_address: Mapped[str] = mapped_column(String(200), default="")
    venue_city: Mapped[str] = mapped_column(String(100), default="")
    venue_postal_code: Mapped[str] = mapped_column(String(20), default="")
    venue_country: Mapped[str] = mapped_column(String(100), default="")
    venue_lat: Mapped[float] = mapped_column(Float, default=0.0)
    venue_lng: Mapped[float] = mapped_column(Float, default=0.0)

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

    def get_producers(self) -> list[str]:
        return json.loads(self.producers) if self.producers else []

    def set_producers(self, ids: list[str]) -> None:
        self.producers = json.dumps(ids)

    def get_sponsors(self) -> list[str]:
        return json.loads(self.sponsors) if self.sponsors else []

    def set_sponsors(self, ids: list[str]) -> None:
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
