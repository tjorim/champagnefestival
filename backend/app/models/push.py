"""Web Push subscriptions."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.vocabularies import Locale
from app.db.base import Base
from app.models.base import _utcnow
from app.models.vocabulary import vocabulary_check


class PushSubscription(Base):
    """An anonymous, device-scoped Web Push subscription (#941).

    Deliberately not linked to ``User``: subscriptions are public and
    anonymous by design (docs/decisions/941-web-push-foundation.md — "
    administrator-only" describes who can trigger a send via
    ``POST /api/push/test``, not who can subscribe), and are inherently
    tied to one browser/device endpoint, not an account. ``endpoint`` is
    the natural key browsers use to resubscribe; a resubscribe with the
    same endpoint upserts this row rather than creating a duplicate.
    """

    __tablename__ = "push_subscriptions"
    __table_args__ = (vocabulary_check("ck_push_subscriptions_locale", "locale", Locale),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    endpoint: Mapped[str] = mapped_column(String(600), unique=True, index=True)
    p256dh_key: Mapped[str] = mapped_column(String(200))
    auth_key: Mapped[str] = mapped_column(String(50))
    locale: Mapped[str] = mapped_column(String(2))
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
