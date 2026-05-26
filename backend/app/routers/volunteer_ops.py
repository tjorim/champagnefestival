"""Volunteer-accessible operational read endpoints.

Provides registration search for on-site volunteers. These endpoints require
a valid Bearer JWT with at least the ``volunteer`` or ``admin`` role.

No PII (email, phone, address, national_register_number) is returned — only
the fields volunteers need on-site: guest name, party size, event, check-in
and strap status, pre-orders, and internal notes (arrival notes visible to
staff).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_volunteer
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.models import Event, Person, Registration, Table
from app.schemas import CheckInGuestOut
from app.utils import registration_to_checkin_dict

router = APIRouter(
    prefix="/api/volunteer",
    tags=["volunteer"],
    dependencies=[Depends(require_volunteer)],
)


@router.get("/registrations", response_model=list[CheckInGuestOut])
async def search_registrations(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, description="Search by guest or table (partial, case-insensitive)"),
    event_id: str | None = Query(default=None, description="Filter to a specific event"),
    pagination: Pagination = Depends(),
) -> list[dict]:
    """Search registrations by guest or table for on-site volunteer check-in.

    Returns a minimal, PII-free view of matching registrations. No email,
    phone, or address fields are exposed. The volunteer can use this endpoint
    to look up a guest by name when the QR code is unavailable.

    Results are ordered by guest name then registration creation time.
    Requires ``volunteer`` or ``admin`` role.
    """
    stmt = (
        select(Registration, Table.name)
        .join(Person, Registration.person_id == Person.id)
        .join(Event, Registration.event_id == Event.id)
        .outerjoin(Table, Registration.table_id == Table.id)
        .options(selectinload(Registration.person), selectinload(Registration.event))
        .order_by(Person.name, Registration.created_at)
    )

    if event_id is not None:
        stmt = stmt.where(Registration.event_id == event_id)

    if q:
        q_stripped = q.strip()
        if q_stripped:
            q_escaped = q_stripped.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
            q_like = f"%{q_escaped}%"
            stmt = stmt.where(
                or_(
                    Person.name.ilike(q_like, escape="\\"),
                    Table.name.ilike(q_like, escape="\\"),
                )
            )

    stmt = apply_pagination(stmt, pagination)
    rows = (await db.execute(stmt)).all()

    return [
        registration_to_checkin_dict(r, r.person, r.event, table_name=table_name)  # type: ignore[arg-type]
        for r, table_name in rows
        if r.person is not None and r.event is not None
    ]
