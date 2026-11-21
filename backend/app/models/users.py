"""Portal accounts and their passwordless sessions."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import _utcnow

if TYPE_CHECKING:
    from app.models.pebble import PebbleAccessToken
    from app.models.registrations import Registration


class User(Base):
    """One portal account, provisioned on first OIDC login or first redeemed
    emailed magic link (#953 decision 1).

    At least one of ``oidc_subject``/``verified_email`` is set. Keycloak
    accounts are provisioned via OIDC login
    (``app.services.users_service.resolve_oidc_user``); email-only accounts by
    redeeming a magic link (``get_or_create_user_by_email``). Since #1209 a
    Keycloak login whose token carries an explicitly verified email joins the
    matching email-only account (or sets the email itself), so password and
    magic-link sign-in reach the same row, bookings and audit trail; both
    identities set means "linked". Roles are never stored here — Keycloak
    stays authoritative. Both kinds read through the same ``registrations``
    relationship and ``/me`` handlers — see
    ``app.visitor_session.get_current_user``.
    """

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "oidc_subject IS NOT NULL OR verified_email IS NOT NULL",
            name="ck_users_has_identity",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    oidc_subject: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    """OIDC ``sub`` claim — stable identifier from the identity provider. Set
    for every Keycloak-backed account, ``NULL`` for email-only accounts."""
    verified_email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True, nullable=True)
    """Email address proven by redeeming a magic link or attested by Keycloak
    (``email_verified`` true). ``NULL`` for a Keycloak account without one."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    registrations: Mapped[list[Registration]] = relationship(back_populates="user")
    pebble_access_token: Mapped[PebbleAccessToken | None] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    visitor_sessions: Mapped[list[VisitorSession]] = relationship(back_populates="user", cascade="all, delete-orphan")


class VisitorMagicLink(Base):
    """Short-lived, single-use passwordless sign-in credential (#953 decision 2).

    One outstanding link per email, hashed token, TTL. Redeeming it
    establishes a persistent ``VisitorSession``. 30-minute TTL
    (``settings.guest_access_token_ttl_minutes``). Previously shared its shape
    with the now-removed ``ReservationAccessToken`` (a one-shot, session-less
    "claim any email you can prove control of" credential, retired in #1044 —
    see docs/decisions/1044-confirm-first-registration-claiming.md); this is
    the only surviving emailed credential of that shape.
    """

    __tablename__ = "visitor_magic_links"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class VisitorSession(Base):
    """Persistent passwordless session established by redeeming a magic link
    (#953 decision 3).

    Database-backed, not a stateless JWT: the opaque ``HttpOnly`` cookie value
    is this row's ``id``, looked up by its hash (``session_hash``) rather than
    the raw ID, mirroring how ``token_hash`` columns above never store a
    credential in cleartext. ``last_seen_at``/``expires_at`` implement the
    confirmed 7-day sliding idle window; ``hard_expires_at`` is the 30-day cap
    that activity can never extend — see
    ``app.visitor_session.SESSION_IDLE_TIMEOUT``/``SESSION_HARD_CAP``.
    """

    __tablename__ = "visitor_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    hard_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    user: Mapped[User] = relationship(back_populates="visitor_sessions")
