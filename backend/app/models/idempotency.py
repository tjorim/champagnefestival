"""Idempotency keys."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.base import _utcnow


class IdempotencyKey(Base):
    """Replay cache guarding idempotency-key-protected bulk/import writes (#837).

    Scoped by ``scope`` (e.g. ``"rooms.bulk_create"``) so the same
    client-supplied ``key`` can't collide across unrelated operations. A
    retried call with the same (``scope``, ``key``) and an identical request
    body replays ``response_body`` instead of re-executing the write; the same
    key reused with a different body is rejected as a conflict. See
    ``app.services.idempotency``.
    """

    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("scope", "key", name="uq_idempotency_keys_scope_key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scope: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(200), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    """sha256 hex digest of the canonicalised request body — detects the same
    key being reused for a genuinely different request."""
    response_body: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
