"""Passwordless visitor session mechanism (#953 decisions 1-3).

A visitor session is database-backed, not a stateless JWT: the ``HttpOnly``
cookie's value is an opaque session ID, looked up here only by its hash
(``VisitorSession.session_hash``), never stored or compared in cleartext —
the same shape ``ReservationAccessToken``/``VisitorMagicLink`` already use
for emailed credentials. This makes the confirmed 7-day sliding idle window
(extend ``expires_at`` on use) and 30-day hard cap (``hard_expires_at``,
never extended) simple row operations instead of needing token-revocation
infrastructure a stateless JWT would require for the same properties.

Structurally separate from staff OIDC auth (``app.auth``): ``require_admin``,
``require_volunteer``, and every other staff-only dependency never look at
this cookie at all, so there is no code path in which a visitor session could
satisfy them (decision 3's scope-limit requirement) — enforced by simply
never importing anything from this module into a staff-only router, not by a
runtime role check that could be gotten wrong.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User, VisitorMagicLink, VisitorSession
from app.oidc_config import OIDCTokenError, decode_token
from app.services.users_service import get_or_create_user
from app.utils import make_id

#: Confirmed by the project owner 2026-09-06 — matches worktime's existing
#: Keycloak realm session-length precedent exactly (sso_session_idle_timeout
#: / sso_session_max_lifespan in tjorim/apps's ansible/playbooks/keycloak.yml).
SESSION_IDLE_TIMEOUT = timedelta(days=7)
SESSION_HARD_CAP = timedelta(days=30)

#: auth_source value for AuditEntry rows written under a visitor session —
#: see AuditEntry.actor's docstring in app/models.py.
VISITOR_AUTH_SOURCE = "visitor_session"

COOKIE_NAME = "visitor_session"

_optional_bearer_scheme = HTTPBearer(auto_error=False)


def _hash_session_id(session_id: str) -> str:
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def set_session_cookie(response: Response, session_id: str) -> None:
    """Set the HttpOnly visitor-session cookie (#953 decision 3).

    ``max_age`` is fixed at the 30-day hard cap and never reissued on
    refresh — the browser keeping the cookie that long is harmless, since
    ``_resolve_session`` below is the actual authority on validity and
    rejects a session past its (never-extended) hard cap regardless of
    whether the cookie is still present.
    """
    response.set_cookie(
        COOKIE_NAME,
        session_id,
        max_age=int(SESSION_HARD_CAP.total_seconds()),
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax")


async def create_session(db: AsyncSession, response: Response, user: User) -> None:
    """Create a VisitorSession row for *user* and set the response cookie.

    Does not commit — caller commits as part of the same transaction (the
    same convention ``write_audit_entry`` uses), so session creation stays
    atomic with whatever redeemed the magic link that authorized it.
    """
    session_id = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    db.add(
        VisitorSession(
            id=make_id("vse"),
            session_hash=_hash_session_id(session_id),
            user_id=user.id,
            created_at=now,
            last_seen_at=now,
            expires_at=now + SESSION_IDLE_TIMEOUT,
            hard_expires_at=now + SESSION_HARD_CAP,
        )
    )
    set_session_cookie(response, session_id)


async def resolve_session(db: AsyncSession, session_id: str) -> VisitorSession | None:
    """Validate *session_id*, slide-refresh it, and return its row — or None.

    Returns the row itself (not just its ``User``) so callers that need the
    refreshed ``expires_at`` — ``GET /api/visitor-sessions/status``, for the
    "clearly see when their session expires" acceptance criterion — don't
    need a second query.

    Commits its own refresh immediately: the sliding-idle extension must be
    durable regardless of what the rest of the request goes on to do,
    exactly like check_check_in_rate_limit's commit-before-anything-that-
    can-fail fix (#932 PR review) — this dependency runs before the route
    handler's own business logic on the same session.
    """
    row = (
        await db.execute(
            select(VisitorSession).where(VisitorSession.session_hash == _hash_session_id(session_id)).with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    now = datetime.now(UTC)
    expires_at = _aware(row.expires_at)
    hard_expires_at = _aware(row.hard_expires_at)
    if now >= expires_at or now >= hard_expires_at:
        return None
    row.last_seen_at = now
    row.expires_at = min(now + SESSION_IDLE_TIMEOUT, hard_expires_at)
    await db.commit()
    await db.refresh(row)
    return row


async def revoke_session(db: AsyncSession, session_id: str) -> None:
    """Delete the VisitorSession row for *session_id*, if any.

    Convergent — repeating this after the row is already gone is a no-op,
    safe to retry.
    """
    await db.execute(delete(VisitorSession).where(VisitorSession.session_hash == _hash_session_id(session_id)))
    await db.commit()


async def cleanup_expired_sessions(db: AsyncSession) -> int:
    """Delete rows past their idle or hard-cap deadline; called by the daily worker sweep."""
    now = datetime.now(UTC)
    deleted_ids = (
        await db.scalars(
            delete(VisitorSession)
            .where((VisitorSession.expires_at < now) | (VisitorSession.hard_expires_at < now))
            .returning(VisitorSession.id)
        )
    ).all()
    await db.commit()
    return len(deleted_ids)


async def cleanup_expired_magic_links(db: AsyncSession) -> int:
    """Delete expired VisitorMagicLink rows; called by the daily worker sweep.

    A link for an email that's never requested again would otherwise linger
    forever — ``request_visitor_magic_link`` only sweeps opportunistically
    (any expired row, not just its own email's), so this covers the gap
    between requests rather than duplicating that logic.
    """
    deleted_ids = (
        await db.scalars(
            delete(VisitorMagicLink)
            .where(VisitorMagicLink.expires_at < datetime.now(UTC))
            .returning(VisitorMagicLink.id)
        )
    ).all()
    await db.commit()
    return len(deleted_ids)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer_scheme),
) -> User:
    """Resolve the caller to a ``User`` from either an OIDC bearer token or a
    visitor-session cookie (#953 decision 1) — the shared seam every
    dual-mode ``/me`` handler depends on instead of
    ``get_current_claims`` + ``get_or_create_user``.
    """
    if credentials is not None:
        try:
            claims = await decode_token(credentials.credentials)
        except OIDCTokenError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")
        return await get_or_create_user(db, subject)

    session_id = request.cookies.get(COOKIE_NAME)
    if session_id:
        session_row = await resolve_session(db, session_id)
        if session_row is not None:
            user = await db.get(User, session_row.user_id)
            if user is not None:
                return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def actor_for_user(user: User) -> tuple[str, str | None]:
    """Return the ``(actor, auth_source)`` pair to pass to ``write_audit_entry``
    for an action taken by *user*, resolved via ``get_current_user`` above.

    An OIDC-backed user keeps the existing "actor is the oidc_subject,
    auth_source inferred as keycloak" shape. A visitor session has no OIDC
    subject to log — its actor is the opaque ``User.id`` (never the email:
    that would put PII in an audit trail kept indefinitely, unlike this
    project's other actor values — see AuditEntry.actor's docstring), with
    an explicit ``auth_source`` so it's never mistaken for one.
    """
    if user.oidc_subject is not None:
        return user.oidc_subject, None
    return user.id, VISITOR_AUTH_SOURCE
