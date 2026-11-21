"""The central message composer."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.base import _utcnow


class ComposedMessage(Base):
    """A centrally-composed operational message delivered through one or more
    explicit channels (#942): the in-app announcement banner and/or Web Push.

    Deliberately reuses ``Announcement``/``announcements_service`` for the
    in-app channel rather than a second in-app storage/delivery mechanism —
    selecting "announcement" here creates/publishes an ``Announcement`` row
    at send time (``announcement_id`` records which one). The Web Push
    channel enqueues one outbox delivery job per targeted subscriber.
    """

    __tablename__ = "composed_messages"
    __table_args__ = (
        CheckConstraint("level IN ('info', 'warning', 'urgent')", name="ck_composed_messages_level"),
        CheckConstraint("state IN ('draft', 'scheduled', 'sent')", name="ck_composed_messages_state"),
        CheckConstraint(
            "(length(trim(title_nl)) > 0 AND length(trim(body_nl)) > 0) IS TRUE",
            name="ck_composed_messages_nl",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    level: Mapped[str] = mapped_column(String(10), default="info")
    channels: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Values from ``{"announcement", "push", "email"}`` — at least one, enforced at
    the schema layer (a DB-level check on JSON array membership isn't worth
    the complexity here)."""
    link_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    email_category_key: Mapped[str | None] = mapped_column(
        ForeignKey("email_categories.key", ondelete="RESTRICT"), nullable=True
    )
    """Audience of the ``email`` channel (#1407): the people with consent for this category. Required
    exactly when ``email`` is a channel."""
    state: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    announcement_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("announcements.id", ondelete="SET NULL"), nullable=True
    )
    push_audience_snapshot: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    """``PushSubscription`` ids targeted at send time — null while
    ``draft``/``scheduled``, immutable once set (the transition to ``sent``
    resolves and freezes this in the same transaction). Resolved fresh at
    send time, not compose time."""
    email_audience_snapshot: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    """``Person`` ids mailed at send time (#1407), frozen like ``push_audience_snapshot``. Each
    recipient is checked again just before their mail is submitted."""
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
