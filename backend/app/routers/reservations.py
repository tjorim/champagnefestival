"""Reservation CRUD endpoints."""

import secrets
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Reservation
from app.schemas import (
    ReservationCreate,
    ReservationListOut,
    ReservationOut,
    ReservationOutWithToken,
    ReservationUpdate,
)
from app.spam import check_form_timing, check_honeypot
from app.utils import (
    reservation_to_dict,
    reservation_to_dict_with_token,
    reservation_to_list_dict,
)

router = APIRouter(prefix="/api/reservations", tags=["reservations"])


def _make_id(prefix: str) -> str:
    ts = int(time.time() * 1000)
    rand = secrets.token_hex(4)
    return f"{prefix}_{ts}_{rand}"


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

    reservation = Reservation(
        id=_make_id("res"),
        name=body.name,
        email=body.email,
        phone=body.phone,
        event_id=body.event_id,
        event_title=body.event_title,
        guest_count=body.guest_count,
        notes=body.notes,
        check_in_token=_make_id("tok"),
    )
    reservation.set_pre_orders([item.model_dump() for item in body.pre_orders])

    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)

    # TODO: Send confirmation e-mail to guest (planned — see README § Planned features)

    return reservation_to_dict(reservation)


# ---------------------------------------------------------------------------
# Admin: list reservations (check_in_token excluded)
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[ReservationListOut],
    dependencies=[Depends(require_admin)],
)
async def list_reservations(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Reservation).order_by(Reservation.created_at.desc()))
    rows = result.scalars().all()
    return [reservation_to_list_dict(r) for r in rows]


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
    if body.table_id is not None:
        r.table_id = body.table_id
    if body.notes is not None:
        r.notes = body.notes
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

