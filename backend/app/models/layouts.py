"""Floor-plan layouts, their revisions and areas."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import _utcnow
from app.models.events import Event

if TYPE_CHECKING:
    from app.models.tables import Table
    from app.models.venues import Room


class Layout(Base):
    """A room arrangement for one event; edition and date derive from that event."""

    __tablename__ = "layouts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), ForeignKey("events.id", ondelete="RESTRICT"), index=True)
    room_id: Mapped[str] = mapped_column(String(64), ForeignKey("rooms.id", ondelete="CASCADE"))
    event: Mapped[Event] = relationship(lazy="joined")
    __table_args__ = (UniqueConstraint("room_id", "event_id", name="uq_layout_room_event"),)

    @hybrid_property
    def edition_id(self) -> str:
        return self.event.edition_id

    @edition_id.inplace.expression
    @classmethod
    def _edition_expression(cls):
        return select(Event.edition_id).where(Event.id == cls.event_id).correlate_except(Event).scalar_subquery()

    label: Mapped[str] = mapped_column(String(200), default="")
    """Human-readable version label, e.g. 'pre-event', 'after cancellations'."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    room: Mapped[Room] = relationship()
    tables: Mapped[list[Table]] = relationship(order_by="Table.created_at, Table.id")
    areas: Mapped[list[Area]] = relationship(order_by="Area.created_at, Area.id")
    # passive_deletes="all": layout_revisions.layout_id is NOT NULL with
    # ON DELETE CASCADE at the DB level (see the migration). Without this,
    # SQLAlchemy's default delete handling would try to load every revision
    # and null out its layout_id before issuing the DELETE, which fails
    # against a NOT NULL column — defer entirely to the DB's own cascade.
    revisions: Mapped[list[LayoutRevision]] = relationship(
        order_by="LayoutRevision.revision_number", passive_deletes="all"
    )


class Area(Base):
    """A non-seating zone on the floor plan (stand, stage, catering, etc.)."""

    __tablename__ = "areas"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    layout_id: Mapped[str] = mapped_column(String(64), ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False)
    organization_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    label: Mapped[str] = mapped_column(String(200))
    icon: Mapped[str] = mapped_column(String(50), default="bi-shop")
    """Stored icon identifier, e.g. 'bi-shop', 'bi-music-note-beamed'. The ``bi-`` names
    predate the move to Lucide and stay as persisted keys; the frontend maps each to a
    Lucide icon (``AreaIcon``)."""

    x: Mapped[float] = mapped_column(default=50.0)
    y: Mapped[float] = mapped_column(default=50.0)
    """Position as a percentage [0, 100] of the layout's rendered canvas. Same
    contract as ``Table.x``/``Table.y`` — see ``docs/floor-plan-coordinates.md``.
    """

    rotation: Mapped[int] = mapped_column(Integer, default=0)
    """Rotation angle in whole degrees [0, 359], clockwise, pivoting around this
    area's own center. Same contract as ``Table.rotation``.
    """

    width_m: Mapped[float] = mapped_column(default=1.5)
    length_m: Mapped[float] = mapped_column(default=1.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class LayoutRevision(Base):
    """An immutable, named geometry snapshot of one ``Layout`` (#1021).

    Follows the ``PolicyVersion`` numbering pattern: ``revision_number``
    increases per ``layout_id`` under a row lock on the parent ``Layout``
    (see ``app.services.layout_revisions_service.save_layout_revision``), and a row
    here is never mutated or deleted once written — restoring an old
    revision applies its snapshot back onto the live ``Layout``/``Table``/
    ``Area`` rows rather than resurrecting this row. ``snapshot`` captures
    each table/area's stable ``id`` plus geometry (matching the ``id`` is
    what lets compare/restore align objects across a rename — see
    ``LayoutRevisionSnapshot``); it deliberately excludes allocations
    (``organization_id``, registration links), which remain live operational
    data outside any revision's scope.
    """

    __tablename__ = "layout_revisions"
    __table_args__ = (UniqueConstraint("layout_id", "revision_number", name="uq_layout_revisions_number"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    layout_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("layouts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(200), default="")
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
