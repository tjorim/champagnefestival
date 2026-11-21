"""Integration clients (machine access)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.base import _utcnow


class IntegrationClient(Base):
    """A managed, database-backed credential for machine automation (MCP).

    Unlike Keycloak client-credentials (which remain fully supported), this is
    an operator-issued credential scoped to exactly one Champagnefestival role
    tier — never more privileged than the admin who created it. Only the
    ``key_hash`` is stored; the raw key is shown once at creation/rotation time
    (see ``app.services.integration_clients_service``).
    """

    __tablename__ = "integration_clients"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    key_preview: Mapped[str] = mapped_column(String(8), nullable=False)
    allowed_role: Mapped[str] = mapped_column(String(20), nullable=False)
    """'admin' | 'volunteer' — the single Champagnefestival role tier this credential
    resolves to via ChampagneFestivalMcpBackend._resolve_role(). Fixed at creation;
    never 'public' (a public-only credential has no reason to exist) and never
    more privileged than created_by_actor's own tier at creation time."""
    created_by_actor: Mapped[str] = mapped_column(String(255), nullable=False)
    """OIDC 'sub' claim of the admin who created this credential (audit/ownership)."""
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rate_limit_window_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rate_limit_window_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
