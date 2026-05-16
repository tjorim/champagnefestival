"""Self-service endpoints for authenticated visitors (``/api/me/*``)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, status
import jwt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_claims
from app.config import settings
from app.database import get_db
from app.models import Event, Registration, User
from app.schemas import MyQrOut, MyRegistrationOut, PaymentStatus, RegistrationStatus
from app.utils import make_id

router = APIRouter(prefix="/api/me", tags=["me"])

_QR_TOKEN_TTL_MINUTES = 15
_QR_ALGORITHM = "HS256"
_QR_FALLBACK_SECRET = "dev-insecure-qr-secret"  # noqa: S105 — only used when no secret is configured


def _qr_secret() -> str:
    return settings.qr_signing_secret or _QR_FALLBACK_SECRET


async def _get_or_create_user(db: AsyncSession, oidc_subject: str) -> User:
    """Return the portal User for *oidc_subject*, creating one if it does not exist."""
    result = await db.execute(select(User).where(User.oidc_subject == oidc_subject))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(id=make_id("usr"), oidc_subject=oidc_subject)
        db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            result = await db.execute(select(User).where(User.oidc_subject == oidc_subject))
            user = result.scalar_one_or_none()
            if user is None:
                raise
        await db.refresh(user)
    return user


@router.get("/registrations", response_model=list[MyRegistrationOut])
async def list_my_registrations(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> list[MyRegistrationOut]:
    """Return all registrations that have been claimed by the authenticated user.

    Auto-provisions a portal ``User`` record on first call if one does not yet
    exist for the caller's OIDC subject.
    """
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")

    user = await _get_or_create_user(db, oidc_subject)

    result = await db.execute(
        select(Registration)
        .options(
            selectinload(Registration.person),
            selectinload(Registration.event).selectinload(Event.edition),
        )
        .where(Registration.user_id == user.id)
        .order_by(Registration.created_at.desc())
    )
    registrations = result.scalars().all()

    payload: list[MyRegistrationOut] = []
    for reg in registrations:
        event = reg.event
        payload.append(
            MyRegistrationOut(
                id=reg.id,
                event_id=reg.event_id,
                event_title=event.title if event else "",
                event_date=event.date if event else None,
                edition_id=event.edition_id if event else None,
                guest_count=reg.guest_count,
                status=cast(RegistrationStatus, reg.status),
                payment_status=cast(PaymentStatus, reg.payment_status),
                checked_in=reg.checked_in,
                checked_in_at=reg.checked_in_at,
                person_name=reg.person.name if reg.person else "",
                created_at=reg.created_at,
            )
        )
    return payload


@router.get("/qr", response_model=MyQrOut)
async def get_my_qr(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> MyQrOut:
    """Return a short-lived signed QR token for VIP entry.

    The token is a compact JWT signed with HMAC-SHA256.  The check-in tablet
    can verify it offline using the same shared secret without a database round-trip.
    """
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")

    user = await _get_or_create_user(db, oidc_subject)

    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=_QR_TOKEN_TTL_MINUTES)

    token_payload = {
        "sub": user.id,
        "oidc_sub": oidc_subject,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }

    token = jwt.encode(token_payload, _qr_secret(), algorithm=_QR_ALGORITHM)

    return MyQrOut(token=token, expires_at=expires_at)
