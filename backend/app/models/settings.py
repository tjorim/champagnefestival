"""Application settings."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.base import _utcnow


class AppSettings(Base):
    """Site-wide settings. Always exactly one row, with a fixed id."""

    __tablename__ = "app_settings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    member_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    member_inactivity_months: Mapped[int | None] = mapped_column(Integer, nullable=True)

    stamp_card_type_id: Mapped[str | None] = mapped_column(ForeignKey("stamp_card_types.id", ondelete="RESTRICT"))
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    public_email: Mapped[str] = mapped_column(String(320), default="nancy.cattrysse@telenet.be")
    public_phone: Mapped[str] = mapped_column(String(30), default="+32 478 48 01 77")
    facebook_url: Mapped[str] = mapped_column(String(500), default="https://www.facebook.com/champagnefestival.kust")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
