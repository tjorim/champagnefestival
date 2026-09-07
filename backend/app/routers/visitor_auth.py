"""Passwordless visitor "My orders" sign-in (#953): magic-link request/redemption
and session status/sign-out.

Distinct from the existing one-shot guest lookup
(``app.routers.registrations``'s ``/my/request``/``/my/access``): redeeming a
magic link here establishes a persistent ``VisitorSession`` (a cookie), not a
single read. See docs/decisions/953-visitor-passwordless-session.md.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.email import send_visitor_magic_link_email
from app.models import VisitorMagicLink
from app.ratelimit import check_rate_limit, get_client_ip
from app.schemas import (
    RegistrationAccessLookupRequest,
    RegistrationGuestOut,
    RegistrationLookupRequest,
    RegistrationLookupRequestAccepted,
    VisitorSessionStatus,
)
from app.services.users_service import claim_unowned_registrations_for_email, get_or_create_user_by_email
from app.utils import make_id, registration_to_guest_dict
from app.visitor_session import (
    COOKIE_NAME,
    VISITOR_AUTH_SOURCE,
    clear_session_cookie,
    create_session,
    resolve_session,
    revoke_session,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/visitor-sessions", tags=["visitor-sessions"])


def _hash_magic_link_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _magic_link_log_id(email: str) -> str:
    return hashlib.sha256(email.encode("utf-8")).hexdigest()[:12]


@router.post("/request", response_model=RegistrationLookupRequestAccepted, status_code=status.HTTP_202_ACCEPTED)
async def request_visitor_magic_link(
    body: RegistrationLookupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RegistrationLookupRequestAccepted:
    """Request a passwordless sign-in link, matching the existing guest-access
    request's non-enumerating shape exactly: identical response regardless of
    whether the email matches anything, rate-limited by requesting IP.
    """
    client_ip = get_client_ip(request)
    if not check_rate_limit(client_ip, scope="visitor-magic-link-request"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    email_norm = str(body.email).lower().strip()
    token = secrets.token_urlsafe(24)
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.guest_access_token_ttl_minutes)
    request_id = _magic_link_log_id(email_norm)
    token_hash = _hash_magic_link_token(token)

    await db.execute(delete(VisitorMagicLink).where(VisitorMagicLink.expires_at < now))
    existing = (
        await db.execute(select(VisitorMagicLink).where(VisitorMagicLink.email == email_norm))
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            VisitorMagicLink(
                id=make_id("vml"),
                email=email_norm,
                token_hash=token_hash,
                expires_at=expires_at,
                created_at=now,
            )
        )
    else:
        existing.token_hash = token_hash
        existing.expires_at = expires_at
        existing.created_at = now
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = (
            await db.execute(select(VisitorMagicLink).where(VisitorMagicLink.email == email_norm))
        ).scalar_one_or_none()
        if existing is None:
            raise
        existing.token_hash = token_hash
        existing.expires_at = expires_at
        existing.created_at = now
        await db.commit()

    try:
        email_sent = await send_visitor_magic_link_email(
            email=email_norm,
            token=token,
            request_id=request_id,
            expires_at=expires_at,
        )
    except Exception:
        logger.exception(
            "Visitor magic-link email delivery failed unexpectedly for request_id=%s.",
            request_id,
        )
        email_sent = False
    logger.info(
        "Prepared visitor magic-link request_id=%s expires_at=%s email_sent=%s",
        request_id,
        expires_at.isoformat(),
        email_sent,
    )
    return RegistrationLookupRequestAccepted(
        delivery_mode="email",
        expires_in_minutes=settings.guest_access_token_ttl_minutes,
    )


async def _get_magic_link_or_401(db: AsyncSession, token: str) -> VisitorMagicLink:
    token_hash = _hash_magic_link_token(token)
    result = await db.execute(
        select(VisitorMagicLink).where(VisitorMagicLink.token_hash == token_hash).with_for_update()
    )
    link = result.scalar_one_or_none()
    if link:
        now = datetime.now(UTC)
        expires_at = link.expires_at if link.expires_at.tzinfo else link.expires_at.replace(tzinfo=UTC)
        if expires_at > now:
            return link
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired sign-in link.",
    )


@router.post("/redeem", response_model=list[RegistrationGuestOut])
async def redeem_visitor_magic_link(
    body: RegistrationAccessLookupRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Redeem a magic link: establish a visitor session and return its orders.

    Single-use (the `with_for_update` lock on the link row serializes a
    concurrent double-redemption — the loser sees the link already expired
    below and 401s, exactly like ``_get_guest_access_token_or_401``).
    Immediately claims any currently-unowned registration matching the
    redeemed email, the same operation ``POST /api/me/registrations/claim``
    performs for an OIDC caller — this link is equally strong proof of email
    control, so no separate token is required here.
    """
    from app.routers.registrations import _load_guest_registrations_by_email

    link = await _get_magic_link_or_401(db, body.token)
    email_norm = link.email
    # Expire in place rather than delete, matching ReservationAccessToken's
    # convention — the row still exists to make a replay cleanly 401.
    link.expires_at = datetime.now(UTC)

    user = await get_or_create_user_by_email(db, email_norm, commit=False)
    await create_session(db, response, user)
    await claim_unowned_registrations_for_email(db, user, email_norm, actor=user.id, auth_source=VISITOR_AUTH_SOURCE)
    rows = await _load_guest_registrations_by_email(db, email_norm)
    await db.commit()
    return [registration_to_guest_dict(registration, person, event) for registration, person, event in rows]


@router.get("/status", response_model=VisitorSessionStatus)
async def visitor_session_status(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> VisitorSessionStatus:
    """Report whether the caller currently holds a valid visitor session.

    Never 401s — an absent or expired session is a normal, expected state
    for this endpoint (used by the frontend to decide whether to show the
    sign-in form or the orders list), not an error. Refreshes the sliding
    idle window on a valid session, same as any other authenticated call.
    """
    # Authentication state for the current cookie must never be served stale
    # by a browser or intermediary cache — e.g. after sign-out or a different
    # identity signing in from the same client (PR #1012 review).
    response.headers["Cache-Control"] = "no-store"
    session_id = request.cookies.get(COOKIE_NAME)
    if not session_id:
        return VisitorSessionStatus(authenticated=False)
    session_row = await resolve_session(db, session_id)
    if session_row is None:
        return VisitorSessionStatus(authenticated=False)
    return VisitorSessionStatus(authenticated=True, expires_at=session_row.expires_at)


@router.post("/sign-out", status_code=status.HTTP_204_NO_CONTENT)
async def sign_out_visitor_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Sign out: delete the session row and clear the cookie.

    Convergent — calling this with no active session (already signed out,
    already expired) is a no-op, not an error, safe to retry.
    """
    session_id = request.cookies.get(COOKIE_NAME)
    if session_id:
        await revoke_session(db, session_id)
    clear_session_cookie(response)
