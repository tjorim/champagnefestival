"""Venues and rooms."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.base import _utcnow


class Venue(Base):
    """A physical venue where the festival takes place."""

    __tablename__ = "venues"
    __table_args__ = (
        CheckConstraint("lat BETWEEN -90 AND 90", name="ck_venues_lat"),
        CheckConstraint("lng BETWEEN -180 AND 180", name="ck_venues_lng"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    postal_code: Mapped[str] = mapped_column(String(20), default="")
    country: Mapped[str] = mapped_column(String(100), default="")
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
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
    venue_id: Mapped[str] = mapped_column(String(64), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False)
    """FK to the Venue this room belongs to."""

    width_m: Mapped[float] = mapped_column(default=20.0)
    """Room width in metres — used to render a proportional canvas.

    The ``default=20.0`` here is a Python-side convenience for ORM callers
    (e.g. test fixtures) that construct a ``Room`` directly; the REST/MCP API
    requires an explicit value (see ``RoomCreate`` and #835) and the DB-level
    ``server_default`` was dropped in migration 010 so a raw insert can no
    longer silently resurrect it.
    """

    length_m: Mapped[float] = mapped_column(default=15.0)
    """Room length in metres. See ``width_m`` for the default-value caveat."""

    color: Mapped[str] = mapped_column(String(20), default="#6c757d")
    """Accent colour for the room badge / canvas border (CSS colour string)."""

    active: Mapped[bool] = mapped_column(Boolean, default=True)

    dimensions_placeholder: Mapped[bool] = mapped_column(Boolean, default=False)
    """True when width_m/length_m are a placeholder rather than a measured value.

    Set by migration 010 for rooms that got the old silent 20x15 default before
    dimensions became a required field (#835), and cleared automatically the
    next time width_m/length_m is explicitly updated (see rooms_service.update_room).
    """

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
