"""Table types and tables."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, select
from sqlalchemy.orm import Mapped, column_property, mapped_column

from app.db.base import Base
from app.models.base import _utcnow
from app.models.layouts import Layout


class TableType(Base):
    """Physical template for a table (shape, dimensions, height, max seats), owned by a venue.

    Scoped like Room (see #858) rather than shared across venues — an organizer's
    physical tables belong to wherever they're actually stored, not a global catalog.
    """

    __tablename__ = "table_types"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    venue_id: Mapped[str] = mapped_column(String(64), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False)
    """FK to the Venue this table type belongs to."""

    shape: Mapped[str] = mapped_column(String(20), default="rectangle")
    """'rectangle' | 'round'"""
    width_m: Mapped[float] = mapped_column(default=0.7)
    """Width in metres (diameter for round tables)."""
    length_m: Mapped[float] = mapped_column(default=1.8)
    """Length in metres (equals width_m for round tables)."""
    height_type: Mapped[str] = mapped_column(String(20), default="low")
    """'low' | 'high'"""
    capacity: Mapped[int] = mapped_column(Integer)
    """Intended soft seating limit for every table of this type."""
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    x: Mapped[float] = mapped_column(default=50.0)
    y: Mapped[float] = mapped_column(default=50.0)
    """Position as a percentage [0, 100] of the layout's *rendered canvas*, not the
    room's raw ``width_m``/``length_m`` — origin top-left, anchored at this table's
    own top-left corner. See ``docs/floor-plan-coordinates.md`` for the full contract
    (including why the canvas isn't a 1:1 percentage of physical room size for small
    rooms) shared with ``Area.x``/``Area.y`` and the frontend editor.
    """

    table_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("table_types.id", ondelete="RESTRICT"), nullable=False
    )
    """FK to the TableType template that defines this table's shape and dimensions."""
    capacity: Mapped[int] = column_property(
        select(TableType.capacity).where(TableType.id == table_type_id).scalar_subquery()
    )
    """Read-only projection of the table type's capacity limit."""

    rotation: Mapped[int] = mapped_column(Integer, default=0)
    """Rotation angle in whole degrees [0, 359], clockwise, pivoting around this
    table's own center. See ``docs/floor-plan-coordinates.md``.
    """

    layout_id: Mapped[str] = mapped_column(String(64), ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False)
    """FK to the Layout this table belongs to."""

    event_id: Mapped[str] = column_property(
        select(Layout.event_id).where(Layout.id == layout_id).correlate_except(Layout).scalar_subquery()
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
