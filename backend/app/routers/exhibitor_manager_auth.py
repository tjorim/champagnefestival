"""Exhibitor-manager login and read-only self-service (#1192)."""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.email import send_exhibitor_manager_magic_link_email
from app.exhibitor_manager_session import (
    COOKIE_NAME,
    clear_session_cookie,
    create_session,
    get_current_exhibitor_manager,
    resolve_session,
    revoke_session,
)
from app.models import Exhibitor, ExhibitorManagerMagicLink, Person
from app.ratelimit import check_rate_limit, get_client_ip
from app.schemas import (
    ExhibitorManagerSessionStatus,
    ManagedExhibitorOut,
    RegistrationAccessLookupRequest,
    RegistrationLookupRequest,
    RegistrationLookupRequestAccepted,
)
from app.utils import make_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/exhibitor-manager-sessions", tags=["exhibitor-manager-sessions"])


def _hash_magic_link_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _magic_link_log_id(email: str) -> str:
    return hashlib.sha256(email.encode("utf-8")).hexdigest()[:12]


@router.post("/request", response_model=RegistrationLookupRequestAccepted, status_code=status.HTTP_202_ACCEPTED)
async def request_exhibitor_manager_magic_link(
    body: RegistrationLookupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RegistrationLookupRequestAccepted:
    """Request a rate-limited link without revealing contact membership."""
    client_ip = get_client_ip(request)
    if not check_rate_limit(client_ip, scope="exhibitor_manager-magic-link-request"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    email_norm = str(body.email).lower().strip()
    accepted = RegistrationLookupRequestAccepted(
        delivery_mode="email", expires_in_minutes=settings.guest_access_token_ttl_minutes
    )
    if not await db.scalar(manager_query(email_norm).limit(1)):
        return accepted
    token = secrets.token_urlsafe(24)
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.guest_access_token_ttl_minutes)
    request_id = _magic_link_log_id(email_norm)
    token_hash = _hash_magic_link_token(token)

    await db.execute(delete(ExhibitorManagerMagicLink).where(ExhibitorManagerMagicLink.expires_at < now))
    existing = (
        await db.execute(select(ExhibitorManagerMagicLink).where(ExhibitorManagerMagicLink.email == email_norm))
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            ExhibitorManagerMagicLink(
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
            await db.execute(select(ExhibitorManagerMagicLink).where(ExhibitorManagerMagicLink.email == email_norm))
        ).scalar_one_or_none()
        if existing is None:
            raise
        existing.token_hash = token_hash
        existing.expires_at = expires_at
        existing.created_at = now
        await db.commit()

    try:
        email_sent = await send_exhibitor_manager_magic_link_email(
            email=email_norm,
            token=token,
            request_id=request_id,
            expires_at=expires_at,
        )
    except Exception:
        logger.exception(
            "Exhibitor manager magic-link email delivery failed unexpectedly for request_id=%s.",
            request_id,
        )
        email_sent = False
    logger.info(
        "Prepared exhibitor_manager magic-link request_id=%s expires_at=%s email_sent=%s",
        request_id,
        expires_at.isoformat(),
        email_sent,
    )
    return RegistrationLookupRequestAccepted(
        delivery_mode="email",
        expires_in_minutes=settings.guest_access_token_ttl_minutes,
    )


async def _get_magic_link_or_401(db: AsyncSession, token: str) -> ExhibitorManagerMagicLink:
    token_hash = _hash_magic_link_token(token)
    result = await db.execute(
        select(ExhibitorManagerMagicLink).where(ExhibitorManagerMagicLink.token_hash == token_hash).with_for_update()
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


@router.post("/redeem", response_model=ExhibitorManagerSessionStatus)
async def redeem_exhibitor_manager_magic_link(
    body: RegistrationAccessLookupRequest, response: Response, db: AsyncSession = Depends(get_db)
) -> ExhibitorManagerSessionStatus:
    link = await _get_magic_link_or_401(db, body.token)
    link.expires_at = datetime.now(UTC)
    await create_session(db, response, link.email)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return ExhibitorManagerSessionStatus(authenticated=True)


@router.get("/status", response_model=ExhibitorManagerSessionStatus)
async def exhibitor_manager_session_status(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> ExhibitorManagerSessionStatus:
    """Report email authentication and refresh a valid manager session."""
    # Authentication state for the current cookie must never be served stale
    # by a browser or intermediary cache — e.g. after sign-out or a different
    # identity signing in from the same client (PR #1012 review).
    response.headers["Cache-Control"] = "no-store"
    session_id = request.cookies.get(COOKIE_NAME)
    if not session_id:
        return ExhibitorManagerSessionStatus(authenticated=False)
    session_row = await resolve_session(db, session_id)
    if session_row is None:
        return ExhibitorManagerSessionStatus(authenticated=False)
    return ExhibitorManagerSessionStatus(authenticated=True, expires_at=session_row.expires_at)


@router.post("/sign-out", status_code=status.HTTP_204_NO_CONTENT)
async def sign_out_exhibitor_manager_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke this manager session and clear its cookie; safe to repeat."""
    session_id = request.cookies.get(COOKIE_NAME)
    if session_id:
        await revoke_session(db, session_id)
    clear_session_cookie(response)


def manager_query(email: str):
    return (
        select(Exhibitor)
        .join(Person, Exhibitor.contact_person_id == Person.id)
        .where(func.lower(func.trim(Person.email)) == email)
    )


me_router = APIRouter(prefix="/api/me/exhibitors", tags=["exhibitor-managers"])


@me_router.get("", response_model=list[ManagedExhibitorOut])
async def my_exhibitors(
    response: Response, email: str = Depends(get_current_exhibitor_manager), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    response.headers["Cache-Control"] = "no-store"
    rows = (await db.scalars(manager_query(email).order_by(Exhibitor.name, Exhibitor.id))).all()
    return [
        {"id": row.id, "name": row.name, "type": row.type, "website": row.website, "active": row.active} for row in rows
    ]
