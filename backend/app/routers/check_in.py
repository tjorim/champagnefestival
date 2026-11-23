"""QR-code check-in endpoints (public, token-gated)."""

from fastapi import APIRouter, Depends, Path, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ratelimit import check_check_in_rate_limit, get_client_ip
from app.db.session import get_db
from app.schemas import CheckInGuestOut, CheckInLookupRequest, CheckInOut, CheckInRequest
from app.services.errors import ApiHTTPException
from app.services.registrations_service import check_in_guest, lookup_guest_check_in

router = APIRouter(prefix="/api/check-in", tags=["check-in"])


# ---------------------------------------------------------------------------
# POST /api/check-in/{id}/lookup  — verify token, return reservation details
# ---------------------------------------------------------------------------


@router.post("/{reservation_id}/lookup", response_model=CheckInGuestOut)
async def lookup_check_in(
    body: CheckInLookupRequest,
    request: Request,
    # Matches Registration.id's column width (models.py) — rejects an
    # obviously-invalid oversized ID with a clean 422 before it can reach the
    # rate limiter or the database (PR #1011 review).
    reservation_id: str = Path(max_length=64),
    db: AsyncSession = Depends(get_db),
) -> CheckInGuestOut:
    """Return minimal reservation details after validating the check-in token.

    Called by the register-side tablet to display guest info before check-in.
    Token is sent in the request body (not the query string) to keep it out of
    server access logs, browser history, and Referer headers.
    Only exposes fields needed on the tablet (name, party size, event, order items,
    check-in/strap status). PII fields (email, phone) are not included.
    """
    client_ip = get_client_ip(request)
    # Commit the bucket increment immediately, before any lookup that can 401 —
    # otherwise a failed guess (the exact traffic this limiter exists to catch)
    # rolls back with the rest of the request's uncommitted transaction and is
    # never actually counted.
    allowed = await check_check_in_rate_limit(db, reservation_id, client_ip)
    await db.commit()
    if not allowed:
        raise ApiHTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "rate_limited",
            "Too many requests. Please try again later.",
        )
    return await lookup_guest_check_in(db, reservation_id, body.token)


@router.post("/{reservation_id}", response_model=CheckInOut)
async def post_check_in(
    body: CheckInRequest,
    request: Request,
    # See lookup_check_in above.
    reservation_id: str = Path(max_length=64),
    db: AsyncSession = Depends(get_db),
) -> CheckInOut:
    """Mark the guest as checked-in (and optionally issue a strap).

    Returns ``already_checked_in: true`` if the guest scanned their QR twice.
    """
    client_ip = get_client_ip(request)
    # See lookup_check_in above: commit the bucket increment before any lookup
    # that can 401, so a failed guess is durably counted even though the rest
    # of this request's transaction hasn't committed yet.
    allowed = await check_check_in_rate_limit(db, reservation_id, client_ip)
    await db.commit()
    if not allowed:
        raise ApiHTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "rate_limited",
            "Too many requests. Please try again later.",
        )
    return await check_in_guest(
        db,
        reservation_id,
        token=body.token,
        issue_strap=body.issue_strap,
        actor=client_ip,
        request_id=getattr(request.state, "request_id", None),
    )
