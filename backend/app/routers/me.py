"""Self-service endpoints for authenticated visitors (``/api/me/*``)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_claims
from app.config import settings
from app.database import get_db
from app.models import Event, Registration, User
from app.schemas import (
    MyQrOut,
    MyRegistrationOut,
    PaymentStatus,
    PebbleAccessTokenOut,
    RegistrationStatus,
)
from app.services.pebble_access import (
    authenticate_pebble_token,
    revoke_pebble_token,
    rotate_pebble_token,
)
from app.utils import make_id

router = APIRouter(prefix="/api/me", tags=["me"])
pebble_router = APIRouter(prefix="/api/pebble", tags=["pebble"])
_bearer_scheme = HTTPBearer(auto_error=True)

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


async def _registrations_for_user(db: AsyncSession, user_id: str) -> list[MyRegistrationOut]:
    result = await db.execute(
        select(Registration)
        .options(
            selectinload(Registration.person),
            selectinload(Registration.event).selectinload(Event.edition),
        )
        .where(Registration.user_id == user_id)
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


@router.get("/registrations", response_model=list[MyRegistrationOut])
async def list_my_registrations(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> list[MyRegistrationOut]:
    """Return registrations claimed by the authenticated portal user."""
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")
    user = await _get_or_create_user(db, oidc_subject)
    return await _registrations_for_user(db, user.id)


@router.post("/pebble-token", response_model=PebbleAccessTokenOut)
async def create_pebble_token(
    response: Response,
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> PebbleAccessTokenOut:
    """Rotate the caller's long-lived token scoped to the Pebble glance."""
    response.headers["Cache-Control"] = "no-store"
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")
    user = await _get_or_create_user(db, oidc_subject)
    return PebbleAccessTokenOut(token=await rotate_pebble_token(db, user.id))


@router.delete("/pebble-token", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pebble_token(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> None:
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")
    user = await _get_or_create_user(db, oidc_subject)
    await revoke_pebble_token(db, user.id)


@pebble_router.get("/registrations", response_model=list[MyRegistrationOut])
async def list_pebble_registrations(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> list[MyRegistrationOut]:
    """Return registrations using a credential that cannot access other APIs."""
    user_id = await authenticate_pebble_token(db, credentials.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked Pebble token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await _registrations_for_user(db, user_id)


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


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete the caller's portal account while preserving festival records.

    Registrations, pre-orders, payment state, check-in state, and audit history
    are operational festival records.  Deleting the portal account only removes
    the OIDC-backed account link so those records can still be fulfilled and
    retained for event/accounting purposes.
    """
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")

    result = await db.execute(select(User).where(User.oidc_subject == oidc_subject))
    user = result.scalar_one_or_none()
    if user is None:
        return

    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
