"""Volunteer periods."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.base import _utcnow


class VolunteerPeriod(Base):
    """A volunteering period for a person with the volunteer role."""

    __tablename__ = "volunteer_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    first_help_day: Mapped[dt_date] = mapped_column(Date, nullable=False)
    last_help_day: Mapped[dt_date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    """Free-text rough schedule/notepad for this period (e.g. "Fri: bar,
    Sat: serving") — deliberately unstructured rather than a role/task
    model; admin-only, not surfaced to the volunteer themselves."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
