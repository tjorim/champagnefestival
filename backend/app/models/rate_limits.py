"""Rate-limit buckets shared between workers."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RateLimitBucket(Base):
    """Cross-worker fixed-window rate-limit counter (#932 decision 1).

    Backs ``app.core.ratelimit.check_rate_limit_pg`` — the Postgres-backed
    replacement for check-in's per-registration limit and shared-IP backstop,
    the two scopes this decision migrates off the in-process deque so they're
    enforced consistently across worker processes. ``key`` packs ``scope`` and
    the caller's bucket key (an IP or registration ID) with a separator that
    can't appear in either half; see ``app.core.ratelimit._bucket_key``. Swept daily
    by ``app.worker`` alongside the outbox cleanup.
    """

    __tablename__ = "rate_limit_buckets"

    key: Mapped[str] = mapped_column(String(300), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
