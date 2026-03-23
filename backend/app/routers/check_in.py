"""QR-code check-in endpoints (public, token-gated)."""

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Event, Person, Registration
from app.ratelimit import check_rate_limit
from app.schemas import CheckInGuestOut, CheckInLookupRequest, CheckInOut, CheckInRequest
from app.utils import registration_to_checkin_dict

router = APIRouter(prefix="/api/check-in", tags=["check-in"])


# ---------------------------------------------------------------------------
# POST /api/check-in/{id}/lookup  — verify token, return reservation details
# ---------------------------------------------------------------------------


@router.post("/{reservation_id}/lookup", response_model=CheckInGuestOut)
async def lookup_check_in(
    reservation_id: str,
    body: CheckInLookupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return minimal reservation details after validating the check-in token.

    Called by the register-side tablet to display guest info before check-in.
    Token is sent in the request body (not the query string) to keep it out of
    server access logs, browser history, and Referer headers.
    Only exposes fields needed on the tablet (name, party size, event, pre-orders,
    check-in/strap status). PII fields (email, phone) are not included.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    r = await _get_by_token_or_401(db, reservation_id, body.token)
    person_result = await db.execute(select(Person).where(Person.id == r.person_id))
    r._person = person_result.scalar_one_or_none()
    event_result = await db.execute(select(Event).where(Event.id == r.event_id))
    r._event = event_result.scalar_one_or_none()
    return registration_to_checkin_dict(r)


# ---------------------------------------------------------------------------
# POST /api/check-in/{id}  — mark checked-in and issue strap
# ---------------------------------------------------------------------------


@router.post("/{reservation_id}", response_model=CheckInOut)
async def post_check_in(
    reservation_id: str,
    body: CheckInRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark the guest as checked-in (and optionally issue a strap).

    Returns ``already_checked_in: true`` if the guest scanned their QR twice.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    r = await _get_by_token_or_401(db, reservation_id, body.token)
    person_result = await db.execute(select(Person).where(Person.id == r.person_id))
    r._person = person_result.scalar_one_or_none()
    event_result = await db.execute(select(Event).where(Event.id == r.event_id))
    r._event = event_result.scalar_one_or_none()

    already = r.checked_in
    changed = False

    if not already:
        r.checked_in = True
        r.checked_in_at = datetime.now(timezone.utc)
        changed = True

    if body.issue_strap and not r.strap_issued:
        r.strap_issued = True
        changed = True

    if changed:
        await db.commit()
        await db.refresh(r)

    return {
        "registration": registration_to_checkin_dict(r),
        "already_checked_in": already,
    }


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def _get_by_token_or_401(
    db: AsyncSession, reservation_id: str, token: str
) -> Registration:
    result = await db.execute(
        select(Registration).where(Registration.id == reservation_id)
    )
    r = result.scalar_one_or_none()
    if r is None or not r.check_in_token or not secrets.compare_digest(r.check_in_token, token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid registration ID or token.",
        )
    return r
