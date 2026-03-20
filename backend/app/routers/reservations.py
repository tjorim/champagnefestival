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
    ReservationAdminCreate,
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
    name_norm = " ".join(body.name.lower().split())

    phone_norm = "".join(c for c in (body.phone or "") if c.isdigit() or c == "+")

    existing = (
        await db.execute(
            select(Person).where(Person.email == email_norm, Person.phone == phone_norm)
        )
    ).scalar_one_or_none()

    if existing is not None and " ".join(existing.name.lower().split()) == name_norm:
        # Certain match — same email + phone + name: link to existing person.
        person = existing
    else:
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

    # TODO: Send confirmation e-mail to guest (planned — see README § Planned features)

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
    email_norm = email.lower().strip()
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
    for r in rows:
        r._person = person_map.get(r.person_id)
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

