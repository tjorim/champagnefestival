"""SQLAlchemy ORM models."""

import json
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
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
    table_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="pending")
    """pending | confirmed | cancelled"""

    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    """unpaid | partial | paid"""

    checked_in: Mapped[bool] = mapped_column(Boolean, default=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    strap_issued: Mapped[bool] = mapped_column(Boolean, default=False)
    check_in_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)

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
    """A physical space within the venue (e.g. main hall or exchange market room).

    Width and height are stored in metres so the frontend can render a
    proportional canvas.
    """

    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    zone_type: Mapped[str] = mapped_column(String(50), default="main-hall")
    """'main-hall' | 'exchange' — grouping for display in the frontend tab bar."""

    width_m: Mapped[float] = mapped_column(default=20.0)
    """Room width in metres — used to render a proportional canvas."""

    height_m: Mapped[float] = mapped_column(default=15.0)
    """Room height in metres."""

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
    # Position as percentage of room dimensions (0–100)
    x: Mapped[float] = mapped_column(default=50.0)
    y: Mapped[float] = mapped_column(default=50.0)
    # Optional room assignment (nullable for backward compat)
    room_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
