"""Self-service endpoints for authenticated visitors (``/api/me/*``)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_claims
from app.config import settings
from app.database import get_db
from app.models import Event, Person, Registration, User
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
        await db.commit()
        await db.refresh(user)
    return user


@router.get("/registrations")
async def list_my_registrations(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
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
            selectinload(Registration.event).selectinload(Event.edition),
        )
        .where(Registration.user_id == user.id)
        .order_by(Registration.created_at.desc())
    )
    registrations = result.scalars().all()

    person_ids = list({r.person_id for r in registrations})
    persons_by_id: dict[str, Person] = {}
    if person_ids:
        persons_result = await db.execute(select(Person).where(Person.id.in_(person_ids)))
        persons_by_id = {p.id: p for p in persons_result.scalars().all()}

    payload = []
    for reg in registrations:
        person = persons_by_id.get(reg.person_id)
        event = reg.event
        payload.append(
            {
                "id": reg.id,
                "event_id": reg.event_id,
                "event_title": event.title if event else "",
                "event_date": event.date if event else None,
                "edition_id": event.edition_id if event else None,
                "guest_count": reg.guest_count,
                "status": reg.status,
                "payment_status": reg.payment_status,
                "checked_in": reg.checked_in,
                "checked_in_at": reg.checked_in_at,
                "person_name": person.name if person else "",
                "created_at": reg.created_at,
            }
        )
    return payload


@router.get("/qr")
async def get_my_qr(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> dict:
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

    return {"token": token, "expires_at": expires_at}
