"""Reservation CRUD endpoints."""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.config import settings
from app.database import get_db
from app.models import Person, Reservation, ReservationAccessToken
from app.routers.people import normalize_phone
from app.schemas import (
    ReservationAdminCreate,
    ReservationAccessLookupRequest,
    ReservationCreate,
    ReservationGuestOut,
    ReservationLookupRequest,
    ReservationLookupRequestAccepted,
    ReservationListOut,
    ReservationOut,
    ReservationOutWithToken,
    ReservationUpdate,
)
from app.spam import check_form_timing, check_honeypot
from app.utils import (
    make_id,
    reservation_to_dict,
    reservation_to_dict_with_token,
    reservation_to_guest_dict,
    reservation_to_list_dict,
)

router = APIRouter(prefix="/api/reservations", tags=["reservations"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public: create reservation
# ---------------------------------------------------------------------------


@router.post("", response_model=ReservationOut, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    body: ReservationCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new VIP reservation.

    This endpoint is publicly accessible.  Anti-spam: honeypot field + minimum
    form-fill time.
    """
    check_honeypot(body.honeypot)
    check_form_timing(body.form_start_time)

    email_norm = str(body.email).lower().strip()
    name_norm = " ".join(body.name.lower().split())

    phone_norm = normalize_phone(body.phone)

    candidates = (
        await db.execute(
            select(Person).where(Person.email == email_norm, Person.phone == phone_norm)
        )
    ).scalars().all()

    person = next(
        (c for c in candidates if " ".join(c.name.lower().split()) == name_norm),
        None,
    )

    if person is None:
        # Uncertain or new: create a fresh person record.
        # If email or phone matches but name differs, the admin People tab will
        # surface the duplicate for manual review and merging.
        person = Person(
            id=make_id("per"),
            name=body.name,
            email=email_norm,
            phone=phone_norm,
        )
        db.add(person)
        await db.flush()

    reservation = Reservation(
        id=make_id("res"),
        event_id=body.event_id,
        event_title=body.event_title,
        guest_count=body.guest_count,
        notes=body.notes,
        person_id=person.id,
        check_in_token=make_id("tok"),
    )
    reservation.pre_orders = [item.model_dump() for item in body.pre_orders]

    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)
    reservation._person = person

    # TODO: Send confirmation e-mail to guest.
    # Planned approach: include the reservation details directly in the e-mail,
    # and send/re-issue short-lived access links only when the guest needs to
    # review or adjust their reservation online.

    return reservation_to_dict(reservation)


# ---------------------------------------------------------------------------
# Admin: create reservation (bypasses anti-spam, accepts person_id directly)
# ---------------------------------------------------------------------------


@router.post(
    "/admin",
    response_model=ReservationOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def admin_create_reservation(
    body: ReservationAdminCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin-only reservation creation.

    Skips honeypot / timing checks.  If ``person_id`` is provided the
    reservation is linked to that person; otherwise a new Person record is
    created from the supplied name / e-mail.
    """
    person_result = await db.execute(select(Person).where(Person.id == body.person_id))
    person = person_result.scalar_one_or_none()
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found.")

    reservation = Reservation(
        id=make_id("res"),
        event_id=body.event_id,
        event_title=body.event_title,
        guest_count=body.guest_count,
        notes=body.notes,
        accessibility_note=body.accessibility_note,
        status=body.status,
        person_id=person.id,
        check_in_token=make_id("tok"),
    )
    reservation.pre_orders = [item.model_dump() for item in body.pre_orders]

    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)
    reservation._person = person

    return reservation_to_dict(reservation)


# ---------------------------------------------------------------------------
# Admin: list reservations with optional search / filter
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[ReservationListOut],
    dependencies=[Depends(require_admin)],
)
async def list_reservations(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, description="Search by name or email (case-insensitive)"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status: pending | confirmed | cancelled"),
    event_id: str | None = Query(default=None, description="Filter by event ID"),
    table_id: str | None = Query(default=None, description="Filter by table ID"),
) -> list[dict]:
    """List all reservations.  Supports optional search and filter query params."""
    stmt = select(Reservation)

    if q:
        # Escape LIKE special characters so user input is treated as a literal
        # substring (prevents % and _ from acting as wildcards).
        q_escaped = q.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        q_like = f"%{q_escaped}%"
        person_subquery = select(Person.id).where(
            or_(
                Person.name.ilike(q_like, escape="\\"),
                Person.email.ilike(q_like, escape="\\"),
            )
        )
        stmt = stmt.where(Reservation.person_id.in_(person_subquery))
    if status_filter:
        stmt = stmt.where(Reservation.status == status_filter)
    if event_id:
        stmt = stmt.where(Reservation.event_id == event_id)
    if table_id:
        stmt = stmt.where(Reservation.table_id == table_id)

    result = await db.execute(stmt.order_by(Reservation.created_at.desc()))
    rows = result.scalars().all()
    person_ids = {r.person_id for r in rows}
    person_map: dict[str, Person] = {}
    if person_ids:
        people_result = await db.execute(select(Person).where(Person.id.in_(person_ids)))
        person_map = {p.id: p for p in people_result.scalars().all()}
    for r in rows:
        r._person = person_map.get(r.person_id)
    return [reservation_to_list_dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Public: visitor self-lookup via e-mail link
# ---------------------------------------------------------------------------


@router.post(
    "/my/request",
    response_model=ReservationLookupRequestAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_my_reservations_access(
    body: ReservationLookupRequest,
    db: AsyncSession = Depends(get_db),
) -> ReservationLookupRequestAccepted:
    """Prepare a secure visitor access link for later e-mail delivery.

    The response is intentionally identical whether or not the e-mail exists,
    so callers cannot enumerate reservations by trying many addresses.
    SMTP delivery is not wired up yet, so the server only stores the token
    server-side and logs that a link was prepared — never the raw token itself.
    """
    email_norm = str(body.email).lower().strip()
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.guest_access_token_ttl_minutes)
    request_id = _guest_access_log_id(email_norm)
    token_hash = _hash_guest_access_token(token)

    existing_token = await db.scalar(
        select(ReservationAccessToken).where(ReservationAccessToken.email == email_norm)
    )
    if existing_token is None:
        db.add(
            ReservationAccessToken(
                id=make_id("rat"),
                email=email_norm,
                token_hash=token_hash,
                expires_at=expires_at,
                created_at=now,
                last_used_at=None,
            )
        )
    else:
        existing_token.token_hash = token_hash
        existing_token.expires_at = expires_at
        existing_token.created_at = now
        existing_token.last_used_at = None
    await db.commit()

    logger.info(
        "Prepared guest reservation access token request_id=%s delivery_mode=email expires_at=%s",
        request_id,
        expires_at.isoformat(),
    )

    return ReservationLookupRequestAccepted(
        delivery_mode="email",
        expires_in_minutes=settings.guest_access_token_ttl_minutes,
    )


@router.post("/my/access", response_model=list[ReservationGuestOut])
async def access_my_reservations(
    body: ReservationAccessLookupRequest,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return visitor reservations after validating a short-lived access token."""
    token_row = await _get_guest_access_token_or_401(db, body.token)
    token_row.last_used_at = datetime.now(timezone.utc)
    rows = await _load_guest_reservations_by_email(db, token_row.email)
    await db.commit()
    return [reservation_to_guest_dict(r) for r in rows]


def _hash_guest_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _guest_access_log_id(email: str) -> str:
    return hashlib.sha256(email.encode("utf-8")).hexdigest()[:12]


async def _get_guest_access_token_or_401(
    db: AsyncSession,
    token: str,
) -> ReservationAccessToken:
    token_hash = _hash_guest_access_token(token)
    result = await db.execute(
        select(ReservationAccessToken).where(
            ReservationAccessToken.token_hash == token_hash
        )
    )
    token_row = result.scalar_one_or_none()
    if token_row:
        now = datetime.now(timezone.utc)
        expires_at = token_row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at > now:
            return token_row

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired reservation access token.",
    )


async def _load_guest_reservations_by_email(
    db: AsyncSession,
    email_norm: str,
) -> list[Reservation]:
    persons_result = await db.execute(select(Person).where(Person.email == email_norm))
    persons = persons_result.scalars().all()
    if not persons:
        return []

    person_map: dict[str, Person] = {p.id: p for p in persons}
    result = await db.execute(
        select(Reservation)
        .where(Reservation.person_id.in_(list(person_map.keys())))
        .order_by(Reservation.created_at.desc())
    )
    rows = result.scalars().all()
    for reservation in rows:
        reservation._person = person_map.get(reservation.person_id)
    return rows


# ---------------------------------------------------------------------------
# Admin: single reservation (includes check_in_token)
# ---------------------------------------------------------------------------


@router.get(
    "/{reservation_id}",
    response_model=ReservationOutWithToken,
    dependencies=[Depends(require_admin)],
)
async def get_reservation(
    reservation_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = await _get_or_404(db, reservation_id)
    person_result = await db.execute(select(Person).where(Person.id == r.person_id))
    r._person = person_result.scalar_one_or_none()
    return reservation_to_dict_with_token(r)


# ---------------------------------------------------------------------------
# Admin: update reservation
# ---------------------------------------------------------------------------


@router.put(
    "/{reservation_id}",
    response_model=ReservationOut,
    dependencies=[Depends(require_admin)],
)
async def update_reservation(
    reservation_id: str,
    body: ReservationUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = await _get_or_404(db, reservation_id)

    if body.status is not None:
        r.status = body.status
    if body.payment_status is not None:
        r.payment_status = body.payment_status
    if "table_id" in body.model_fields_set:
        r.table_id = body.table_id
    if body.notes is not None:
        r.notes = body.notes
    if body.accessibility_note is not None:
        r.accessibility_note = body.accessibility_note
    if "person_id" in body.model_fields_set:
        if body.person_id is None:
            raise HTTPException(status_code=400, detail="person_id cannot be removed; every reservation requires a person.")
        person_result = await db.execute(select(Person).where(Person.id == body.person_id))
        person = person_result.scalar_one_or_none()
        if person is None:
            raise HTTPException(status_code=404, detail="Person not found.")
        r.person_id = body.person_id
    if body.pre_orders is not None:
        r.pre_orders = [item.model_dump() for item in body.pre_orders]
    if body.checked_in is not None:
        if body.checked_in and not r.checked_in:
            r.checked_in_at = datetime.now(timezone.utc)
        r.checked_in = body.checked_in
    if body.strap_issued is not None:
        r.strap_issued = body.strap_issued

    await db.commit()
    await db.refresh(r)
    person_result = await db.execute(select(Person).where(Person.id == r.person_id))
    r._person = person_result.scalar_one_or_none()
    return reservation_to_dict(r)


# ---------------------------------------------------------------------------
# Admin: delete reservation
# ---------------------------------------------------------------------------


@router.delete(
    "/{reservation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_reservation(
    reservation_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    r = await _get_or_404(db, reservation_id)
    await db.delete(r)
    await db.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_or_404(db: AsyncSession, reservation_id: str) -> Reservation:
    result = await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )
    r = result.scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    return r
