"""Event and product categories."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.translations import resolve_text
from app.db.base import Base
from app.models.base import _utcnow


class _CategoryColumns:
    """Columns shared by the admin-managed category tables: a stable key (what
    the events or products store) plus its label in each language, following the
    organisation description pattern — Dutch must have text, the
    others are optional and fall back to it. The key is immutable; a category
    that is still in use cannot be deleted."""

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    label_nl: Mapped[str | None] = mapped_column(String(100), nullable=True)
    label_fr: Mapped[str | None] = mapped_column(String(100), nullable=True)
    label_en: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized_label(self, locale: str | None) -> str:
        return resolve_text({"nl": self.label_nl, "fr": self.label_fr, "en": self.label_en}, locale)


def _category_label_check(table: str) -> CheckConstraint:
    return CheckConstraint("(length(trim(label_nl)) > 0) IS TRUE", name=f"ck_{table}_label_nl")


class EventCategory(_CategoryColumns, Base):
    """A category of events, shown as a translated label on the public schedule."""

    __tablename__ = "event_categories"
    __table_args__ = (_category_label_check("event_categories"),)


class ProductCategory(_CategoryColumns, Base):
    """A category of products. The key is what products and the order lines
    copied from them store; delivery tracking treats ``champagne`` specially."""

    __tablename__ = "product_categories"
    __table_args__ = (_category_label_check("product_categories"),)
