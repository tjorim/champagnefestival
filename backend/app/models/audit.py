"""The audit trail."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.vocabularies import AuditSource
from app.db.base import Base
from app.models.base import _utcnow
from app.models.vocabulary import vocabulary_check


class AuditEntry(Base):
    """Immutable audit record for high-impact event-day mutations."""

    __tablename__ = "audit_entries"
    __table_args__ = (vocabulary_check("ck_audit_entries_auth_source", "auth_source", AuditSource),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(255), index=True)
    """OIDC ``sub`` claim, client IP for token-gated ops (``auth_source ==
    "token"``, set only by ``get_client_ip``'s callers — see
    ``app.core.ratelimit.get_client_ip``, whose fallback value is the literal
    string ``"unknown"`` when the connection has no resolvable peer), a
    visitor session's opaque ``User.id`` (``auth_source == "visitor_session"``
    — never the verified email itself, which would put PII in an audit trail
    kept indefinitely; see ``app.services.visitor_session.actor_for_user``), or
    'anonymous'. A row with ``auth_source == "token"`` has its actor blanked
    to ``""`` 30 days after ``timestamp`` by a VPS-scheduled job in
    ``tjorim/apps`` (`infra/scheduled-jobs/champagnefestival-redact-audit-entry-ips.sql`)
    — see docs/decisions/934-data-retention-and-erasure.md. The entry itself
    (action, resource, timestamp) is kept indefinitely; only the actor is
    time-limited. The job blanks every ``auth_source == "token"`` row
    unconditionally rather than pattern-matching for IP-shaped values: that
    ``auth_source`` is set by exactly this codebase's own writers, always
    paired with ``get_client_ip``'s output, so there is no other value it
    could hold to protect against — and blanking a placeholder like
    "unknown" is harmless either way, since it was never personal data."""
    auth_source: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown", index=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    integration_client_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    resource_type: Mapped[str] = mapped_column(String(50), index=True)
    resource_id: Mapped[str] = mapped_column(String(64), index=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
