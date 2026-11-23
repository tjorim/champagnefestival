"""Site announcements."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.translations import resolve_text
from app.db.base import Base
from app.models.base import _utcnow


class Announcement(Base):
    """A short, scheduled, localized operational notice."""

    __tablename__ = "announcements"
    __table_args__ = (
        UniqueConstraint("sort_order", name="uq_announcements_sort_order", deferrable=True, initially="DEFERRED"),
        CheckConstraint("level IN ('info', 'warning', 'urgent')", name="ck_announcements_level"),
        CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="ck_announcements_window"),
        CheckConstraint("(length(trim(text_nl)) > 0) IS TRUE", name="ck_announcements_text_nl"),
        CheckConstraint(
            "(link_url IS NULL OR length(trim(link_label_nl)) > 0) IS TRUE",
            name="ck_announcements_link_label_nl",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    text_nl: Mapped[str] = mapped_column(String(500), nullable=False)
    text_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    text_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    level: Mapped[str] = mapped_column(String(10), default="info")
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    link_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    link_label_nl: Mapped[str | None] = mapped_column(String(120), nullable=True)
    link_label_en: Mapped[str | None] = mapped_column(String(120), nullable=True)
    link_label_fr: Mapped[str | None] = mapped_column(String(120), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized_text(self, locale: str | None) -> str:
        return resolve_text({"nl": self.text_nl, "fr": self.text_fr, "en": self.text_en}, locale)

    def localized_link_label(self, locale: str | None) -> str | None:
        if not self.link_url:
            return None
        return (
            resolve_text(
                {"nl": self.link_label_nl, "fr": self.link_label_fr, "en": self.link_label_en},
                locale,
            )
            or None
        )
