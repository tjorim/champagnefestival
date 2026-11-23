"""Frequently asked questions."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.translations import resolve_pair
from app.db.base import Base
from app.models.base import _utcnow


class FaqItem(Base):
    """A single question/answer pair shown on the public FAQ section.

    Dutch must have both; other languages are optional translations. A language
    is shown only when its question *and* answer both have text, otherwise the
    Dutch text is shown.
    """

    __tablename__ = "faq_items"
    __table_args__ = (
        # Deferred so a reorder can touch several rows in one transaction
        # without a transient duplicate mid-transaction tripping the check —
        # only the state at commit has to be unique (#836).
        UniqueConstraint("sort_order", name="uq_faq_items_sort_order", deferrable=True, initially="DEFERRED"),
        CheckConstraint(
            "(length(trim(question_nl)) > 0 AND length(trim(answer_nl)) > 0) IS TRUE",
            name="ck_faq_items_nl",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    question_nl: Mapped[str] = mapped_column(String(500), nullable=False)
    question_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    question_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    answer_nl: Mapped[str] = mapped_column(Text, nullable=False)
    answer_fr: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized(self, locale: str | None) -> tuple[str, str]:
        """The (question, answer) for *locale*, falling back to Dutch."""
        return resolve_pair(
            {"nl": self.question_nl, "fr": self.question_fr, "en": self.question_en},
            {"nl": self.answer_nl, "fr": self.answer_fr, "en": self.answer_en},
            locale,
        )
