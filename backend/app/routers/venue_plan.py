"""Read-only venue plan endpoint for volunteers and admins."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_volunteer
from app.database import get_db
from app.models import Area, Edition, Layout, Room, Table

router = APIRouter(
    prefix="/api/venue-plan",
    tags=["venue-plan"],
    dependencies=[Depends(require_volunteer)],
)


@router.get("/{edition_id}")
async def get_venue_plan(
    edition_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the complete floor layout for an edition (rooms, tables, areas).

    Accessible by volunteers and admins.  Returns a read-only snapshot — no
    writes are performed.
    """
    # Verify the edition exists and load its events so we can resolve dates.
    result = await db.execute(
        select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found.")

    unique_dates: list[date] = sorted({event.date for event in edition.events})

    # Load all layouts for the edition together with rooms, tables, and areas.
    layouts_result = await db.execute(
        select(Layout).where(Layout.edition_id == edition_id).order_by(Layout.day_id)
    )
    layouts = list(layouts_result.scalars().all())

    if not layouts:
        return {"edition_id": edition_id, "layouts": []}

    layout_ids = [lay.id for lay in layouts]
    room_ids = list({lay.room_id for lay in layouts})

    rooms_result = await db.execute(select(Room).where(Room.id.in_(room_ids)))
    rooms_by_id: dict[str, Room] = {r.id: r for r in rooms_result.scalars().all()}

    tables_result = await db.execute(select(Table).where(Table.layout_id.in_(layout_ids)))
    tables_by_layout: dict[str, list[Table]] = {}
    for table in tables_result.scalars().all():
        tables_by_layout.setdefault(table.layout_id, []).append(table)

    areas_result = await db.execute(select(Area).where(Area.layout_id.in_(layout_ids)))
    areas_by_layout: dict[str, list[Area]] = {}
    for area in areas_result.scalars().all():
        areas_by_layout.setdefault(area.layout_id, []).append(area)

    payload_layouts = []
    for lay in layouts:
        layout_date: date | None = None
        if 1 <= lay.day_id <= len(unique_dates):
            layout_date = unique_dates[lay.day_id - 1]

        room = rooms_by_id.get(lay.room_id)
        room_payload = (
            {
                "id": room.id,
                "name": room.name,
                "width_m": room.width_m,
                "length_m": room.length_m,
                "color": room.color,
            }
            if room
            else None
        )

        tables_payload = [
            {
                "id": t.id,
                "name": t.name,
                "capacity": t.capacity,
                "x": t.x,
                "y": t.y,
                "rotation": t.rotation,
                "table_type_id": t.table_type_id,
                "registration_ids": t.reservation_ids,
            }
            for t in tables_by_layout.get(lay.id, [])
        ]

        areas_payload = [
            {
                "id": a.id,
                "label": a.label,
                "icon": a.icon,
                "x": a.x,
                "y": a.y,
                "rotation": a.rotation,
                "width_m": a.width_m,
                "length_m": a.length_m,
                "exhibitor_id": a.exhibitor_id,
            }
            for a in areas_by_layout.get(lay.id, [])
        ]

        payload_layouts.append(
            {
                "id": lay.id,
                "day_id": lay.day_id,
                "date": layout_date,
                "label": lay.label,
                "room": room_payload,
                "tables": tables_payload,
                "areas": areas_payload,
            }
        )

    return {"edition_id": edition_id, "layouts": payload_layouts}
