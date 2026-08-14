"""Event management endpoints.

Business logic — the create/update transition, delete guard, and shared
lookup/validation helpers — lives in ``app.services.events_service`` and is
shared with ``app.mcp.admin.events``; see that module's docstring for why
events use ``HTTPException`` directly rather than the ``ServiceError``
convention other services follow.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_actor_id, require_admin, require_volunteer
from app.database import get_db
from app.models import Event, Registration
from app.schemas import EventCheckInStats, EventCreate, EventOut, EventUpdate
from app.services import events_service
from app.utils import event_to_summary_dict

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventOut], dependencies=[Depends(require_volunteer)])
async def list_events(
    db: AsyncSession = Depends(get_db),
    edition_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    category: str | None = Query(default=None),
    registration_required: bool | None = Query(default=None),
    active: bool | None = Query(default=None),
) -> list[dict]:
    stmt = (
        select(Event)
        .options(selectinload(Event.edition), selectinload(Event.products))
        .order_by(Event.date, Event.start_time, Event.created_at)
    )
    if edition_id is not None:
        stmt = stmt.where(Event.edition_id == edition_id)
    if date_from is not None:
        stmt = stmt.where(Event.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Event.date <= date_to)
    if category is not None:
        stmt = stmt.where(Event.category == category)
    if registration_required is not None:
        stmt = stmt.where(Event.registration_required.is_(registration_required))
    if active is not None:
        stmt = stmt.where(Event.active.is_(active))
    events = (await db.execute(stmt)).scalars().all()
    return [event_to_summary_dict(event, include_edition=True) for event in events]


@router.get(
    "/checkin-stats",
    response_model=list[EventCheckInStats],
    dependencies=[Depends(require_volunteer)],
)
async def get_checkin_stats(
    db: AsyncSession = Depends(get_db),
    edition_id: str | None = Query(default=None),
) -> list[dict]:
    """Per-event guest counts, checked-in vs. total, for a live progress display at the entrance.

    Counts guests (`sum(guest_count)`), not bookings, matching the admin's own capacity panel
    (`RegistrationList.tsx`'s `eventCapacityStats`) — a booking can carry several guests, and a
    headcount is what a live entrance display and a capacity limit both actually care about.
    Registered but cancelled bookings are excluded from both counts, since they were never
    going to show up. Kept separate from the public `/api/editions/active` payload (and from
    `EventOut`) since check-in progress is volunteer/admin-only information.
    """
    stmt = (
        select(
            Registration.event_id,
            func.coalesce(func.sum(Registration.guest_count), 0).label("total"),
            func.coalesce(func.sum(Registration.guest_count).filter(Registration.checked_in.is_(True)), 0).label(
                "checked_in"
            ),
        )
        .where(Registration.status != "cancelled")
        .group_by(Registration.event_id)
    )
    if edition_id is not None:
        stmt = stmt.join(Event, Event.id == Registration.event_id).where(Event.edition_id == edition_id)
    rows = (await db.execute(stmt)).all()
    return [{"event_id": row.event_id, "total": row.total, "checked_in": row.checked_in} for row in rows]


@router.get("/{event_id}", response_model=EventOut, dependencies=[Depends(require_admin)])
async def get_event(event_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    event = await events_service.get_event_or_404(db, event_id)
    return event_to_summary_dict(event, include_edition=True)


@router.post(
    "",
    response_model=EventOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_event(
    body: EventCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await events_service.create_event(
        db, body=body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.put("/{event_id}", response_model=EventOut, dependencies=[Depends(require_admin)])
async def update_event(
    event_id: str,
    body: EventUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    event = await events_service.get_event_or_404(db, event_id)
    return await events_service.apply_event_update(
        db, event, body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_event(
    event_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    event = await events_service.get_event_or_404(db, event_id)
    await events_service.delete_event(db, event, actor=actor, request_id=getattr(request.state, "request_id", None))
