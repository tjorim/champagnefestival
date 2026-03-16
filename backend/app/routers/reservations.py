"""Reservation CRUD endpoints."""

from datetime import datetime, timezone

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import EmailStr
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Person, Reservation
from app.schemas import (
    ReservationCreate,
    ReservationGuestOut,
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
    person_result = await db.execute(
        select(Person).where(Person.email == email_norm).order_by(Person.id)
    )
    matched_people = person_result.scalars().all()

    if len(matched_people) == 0:
        person = Person(
            id=make_id("per"),
            name=body.name,
            email=email_norm,
        )
        db.add(person)
        await db.flush()
    elif len(matched_people) == 1:
        person = matched_people[0]
    else:
        person = matched_people[0]

    reservation = Reservation(
        id=make_id("res"),
        name=body.name,
        email=body.email,
        phone=body.phone,
        event_id=body.event_id,
        event_title=body.event_title,
        guest_count=body.guest_count,
        notes=body.notes,
        person_id=person.id,
        check_in_token=make_id("tok"),
    )
    reservation.set_pre_orders([item.model_dump() for item in body.pre_orders])

    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)

    # TODO: Send confirmation e-mail to guest (planned — see README § Planned features)

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
        stmt = stmt.where(
            or_(
                Reservation.name.ilike(f"%{q_escaped}%", escape="\\"),
                Reservation.email.ilike(f"%{q_escaped}%", escape="\\"),
            )
        )
    if status_filter:
        stmt = stmt.where(Reservation.status == status_filter)
    if event_id:
        stmt = stmt.where(Reservation.event_id == event_id)
    if table_id:
        stmt = stmt.where(Reservation.table_id == table_id)

    result = await db.execute(stmt.order_by(Reservation.created_at.desc()))
    rows = result.scalars().all()
    return [reservation_to_list_dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Public: visitor self-lookup by e-mail
# ---------------------------------------------------------------------------


@router.get("/my", response_model=list[ReservationGuestOut])
async def my_reservations(
    email: Annotated[EmailStr, Query(description="E-mail address used when making the reservation")],
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return all reservations belonging to the given e-mail address.

    This endpoint is publicly accessible — no admin token required.
    It exposes only safe booking-status fields; sensitive fields (phone,
    internal notes, check-in token) are never returned here.

    **Note on e-mail enumeration:** an empty result (``[]``) for a given
    address reveals that no reservation exists for that e-mail.  This is
    intentional — the use-case requires guests to look up their own bookings
    by e-mail — and is consistent with the visitor-facing UI.

    This supports two visitor-facing user stories:
    - **Order overview**: guests can check the status of their bookings
      across all editions.
    - **QR retrieval**: once e-mail confirmation is implemented (see
      README § Planned features), the confirmation e-mail will contain the
      deep-link; this endpoint provides a fallback for guests who lost it.
    """
    result = await db.execute(
        select(Reservation)
        .where(Reservation.email == email.lower().strip())
        .order_by(Reservation.created_at.desc())
    )
    rows = result.scalars().all()
    return [reservation_to_guest_dict(r) for r in rows]


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
    if "person_id" in body.model_fields_set:
        if body.person_id is None:
            r.person_id = None
        else:
            person_result = await db.execute(select(Person).where(Person.id == body.person_id))
            person = person_result.scalar_one_or_none()
            if person is None:
                raise HTTPException(status_code=404, detail="Person not found.")
            r.person_id = person.id
    if body.pre_orders is not None:
        r.set_pre_orders([item.model_dump() for item in body.pre_orders])
    if body.checked_in is not None:
        if body.checked_in and not r.checked_in:
            r.checked_in_at = datetime.now(timezone.utc)
        r.checked_in = body.checked_in
    if body.strap_issued is not None:
        r.strap_issued = body.strap_issued

    await db.commit()
    await db.refresh(r)
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

