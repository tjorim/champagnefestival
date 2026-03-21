"""Event management endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_admin
from app.database import get_db
from app.models import Edition, Event
from app.schemas import EventCreate, EventOut, EventUpdate
from app.utils import event_to_summary_dict, make_id

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventOut])
async def list_events(
    db: AsyncSession = Depends(get_db),
    edition_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    category: str | None = Query(default=None),
    registration_required: bool | None = Query(default=None),
    active: bool | None = Query(default=None),
) -> list[dict]:
    stmt = select(Event).options(selectinload(Event.edition)).order_by(
        Event.date, Event.sort_order, Event.start_time, Event.created_at
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


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    event = await _get_or_404(db, event_id)
    return event_to_summary_dict(event, include_edition=True)


@router.post(
    "",
    response_model=EventOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_event(body: EventCreate, db: AsyncSession = Depends(get_db)) -> dict:
    await _ensure_edition_exists(db, body.edition_id)
    event = Event(
        id=make_id("evt"),
        edition_id=body.edition_id,
        title=body.title,
        description=body.description,
        date=body.date,
        start_time=body.start_time,
        end_time=body.end_time,
        category=body.category,
        location=body.location,
        presenter=body.presenter,
        registration_required=body.registration_required,
        registrations_open_from=body.registrations_open_from,
        max_capacity=body.max_capacity,
        sort_order=body.sort_order,
        active=body.active,
    )
    db.add(event)
    await db.commit()
    event = await _get_or_404(db, event.id)
    return event_to_summary_dict(event, include_edition=True)


@router.put("/{event_id}", response_model=EventOut, dependencies=[Depends(require_admin)])
async def update_event(
    event_id: str, body: EventUpdate, db: AsyncSession = Depends(get_db)
) -> dict:
    event = await _get_or_404(db, event_id)

    if "edition_id" in body.model_fields_set and body.edition_id is not None:
        await _ensure_edition_exists(db, body.edition_id)
        event.edition_id = body.edition_id
    for field in [
        "title",
        "description",
        "date",
        "start_time",
        "end_time",
        "category",
        "location",
        "presenter",
        "registration_required",
        "registrations_open_from",
        "max_capacity",
        "sort_order",
        "active",
    ]:
        if field in body.model_fields_set:
            setattr(event, field, getattr(body, field))

    await db.commit()
    event = await _get_or_404(db, event.id)
    return event_to_summary_dict(event, include_edition=True)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_event(event_id: str, db: AsyncSession = Depends(get_db)) -> None:
    event = await _get_or_404(db, event_id)
    await db.delete(event)
    await db.commit()


async def _get_or_404(db: AsyncSession, event_id: str) -> Event:
    result = await db.execute(
        select(Event).options(selectinload(Event.edition)).where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


async def _ensure_edition_exists(db: AsyncSession, edition_id: str) -> Edition:
    result = await db.execute(select(Edition).where(Edition.id == edition_id))
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail=f"Edition '{edition_id}' not found.")
    return edition

