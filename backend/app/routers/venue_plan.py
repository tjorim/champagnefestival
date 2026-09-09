"""Read-only venue plan endpoint for volunteers and admins."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_volunteer
from app.database import get_db
from app.models import Edition, Layout, Registration, RegistrationAllocation
from app.schemas import VenuePlanAreaOut, VenuePlanLayoutOut, VenuePlanOut, VenuePlanRoomOut, VenuePlanTableOut

router = APIRouter(
    prefix="/api/venue-plan",
    tags=["venue-plan"],
    dependencies=[Depends(require_volunteer)],
)


@router.get("/{edition_id}", response_model=VenuePlanOut)
async def get_venue_plan(
    edition_id: str,
    db: AsyncSession = Depends(get_db),
) -> VenuePlanOut:
    """Return the complete floor layout for an edition (rooms, tables, areas).

    Accessible by volunteers and admins.  Returns a read-only snapshot — no
    writes are performed.
    """
    # Verify the edition exists and load its events so we can resolve dates.
    result = await db.execute(select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id))
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found.")

    # Load all layouts for the edition together with rooms, tables, and areas.
    layouts_result = await db.execute(
        select(Layout)
        .options(
            selectinload(Layout.room),
            selectinload(Layout.tables),
            selectinload(Layout.areas),
        )
        .where(Layout.edition_id == edition_id)
        .order_by(Layout.event_id, Layout.room_id)
    )
    layouts = list(layouts_result.scalars().all())

    if not layouts:
        return VenuePlanOut(edition_id=edition_id, layouts=[])

    table_ids = [table.id for layout in layouts for table in layout.tables]
    table_registration_ids: dict[str, list[str]] = {}
    exclusive_tables: set[str] = set()
    occupied_seats: dict[str, int] = {}
    if table_ids:
        registrations = await db.execute(
            select(
                Registration.id,
                RegistrationAllocation.table_id,
                RegistrationAllocation.guest_count,
                RegistrationAllocation.exclusive,
            )
            .join(RegistrationAllocation, RegistrationAllocation.registration_id == Registration.id)
            .where(RegistrationAllocation.table_id.in_(table_ids), Registration.status != "cancelled")
        )
        for registration_id, table_id, guest_count, exclusive in registrations.all():
            if exclusive:
                exclusive_tables.add(table_id)
            table_registration_ids.setdefault(table_id, []).append(registration_id)
            occupied_seats[table_id] = occupied_seats.get(table_id, 0) + guest_count

    payload_layouts = []
    for lay in layouts:
        layout_date = lay.event.date

        room = lay.room
        room_payload = (
            VenuePlanRoomOut(
                id=room.id,
                name=room.name,
                width_m=room.width_m,
                length_m=room.length_m,
                color=room.color,
            )
            if room
            else None
        )

        tables_payload = [
            VenuePlanTableOut(
                id=t.id,
                name=t.name,
                capacity=t.capacity,
                x=t.x,
                y=t.y,
                rotation=t.rotation,
                table_type_id=t.table_type_id,
                registration_ids=table_registration_ids.get(t.id, []),
                occupied_seats=occupied_seats.get(t.id, 0),
                exclusive=t.id in exclusive_tables,
            )
            for t in lay.tables
        ]

        areas_payload = [
            VenuePlanAreaOut(
                id=a.id,
                label=a.label,
                icon=a.icon,
                x=a.x,
                y=a.y,
                rotation=a.rotation,
                width_m=a.width_m,
                length_m=a.length_m,
                exhibitor_id=a.exhibitor_id,
            )
            for a in lay.areas
        ]

        payload_layouts.append(
            VenuePlanLayoutOut(
                id=lay.id,
                event_id=lay.event_id,
                event_title=lay.event.title,
                date=layout_date,
                label=lay.label,
                room=room_payload,
                tables=tables_payload,
                areas=areas_payload,
            )
        )

    return VenuePlanOut(edition_id=edition_id, layouts=payload_layouts)
