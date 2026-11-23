"""Events."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, String, Text, Time, func
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.translations import resolve_text
from app.db.base import Base
from app.models.base import _optional_dutch_check, _utcnow

if TYPE_CHECKING:
    from app.models.editions import Edition
    from app.models.orders import EventOrderQuestion
    from app.models.products import Product
    from app.models.registrations import Registration


class Event(Base):
    __tablename__ = "events"

    __table_args__ = (
        CheckConstraint("(length(trim(title_nl)) > 0) IS TRUE", name="ck_events_title_nl"),
        CheckConstraint(_optional_dutch_check("description"), name="ck_events_description_nl"),
        CheckConstraint(
            "extract(second from start_time) = 0 AND start_time < TIME '24:00'", name="ck_events_start_time_minute"
        ).ddl_if(dialect="postgresql"),
        CheckConstraint(
            "extract(second from end_time) = 0 AND end_time < TIME '24:00'", name="ck_events_end_time_minute"
        ).ddl_if(dialect="postgresql"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    title_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description_nl: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_fr: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_en: Mapped[str | None] = mapped_column(Text, nullable=True)

    @hybrid_property
    def title(self) -> str:
        """Dutch title: what admin lists, audit entries and exports show.
        Visitors get ``localized_title`` instead. Read-only: write ``title_nl/fr/en``."""
        return self.title_nl or ""

    @title.inplace.expression
    @classmethod
    def _title_expression(cls):
        return func.coalesce(cls.title_nl, "")

    @hybrid_property
    def description(self) -> str:
        """Dutch description, ``""`` when there is none (see ``title``)."""
        return self.description_nl or ""

    @description.inplace.expression
    @classmethod
    def _description_expression(cls):
        return func.coalesce(cls.description_nl, "")

    def localized_title(self, locale: str | None) -> str:
        return resolve_text({"nl": self.title_nl, "fr": self.title_fr, "en": self.title_en}, locale)

    def localized_description(self, locale: str | None) -> str:
        return resolve_text({"nl": self.description_nl, "fr": self.description_fr, "en": self.description_en}, locale)

    date: Mapped[dt_date] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    category: Mapped[str] = mapped_column(
        String(50), ForeignKey("event_categories.key", ondelete="RESTRICT"), index=True
    )
    """Key of an `EventCategory`, shown as a translated label on the public
    schedule — purely cosmetic, does not affect what guests can order. Whether
    this event sells anything is answered by whether it *has* products (see
    `Product`), not by a separate flag on the event."""

    order_questions: Mapped[list[EventOrderQuestion]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="EventOrderQuestion.sort_order, EventOrderQuestion.id"
    )

    volunteers_only: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    members_only: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    registration_required: Mapped[bool] = mapped_column(Boolean, default=False)
    registrations_open_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    registrations_close_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    edition: Mapped[Edition] = relationship(back_populates="events")
    registrations: Mapped[list[Registration]] = relationship(back_populates="event")
    products: Mapped[list[Product]] = relationship(back_populates="event", cascade="all, delete-orphan")
