"""Layout snapshot management endpoints (admin only)."""

import math
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_admin
from app.database import get_db
from app.models import Area, Edition, Layout, Room, Table, TableType
from app.schemas import LayoutCopyCreate, LayoutCreate, LayoutOut
from app.utils import layout_to_dict, make_id

# Mirror the rendering constants from frontend/src/utils/layoutUtils.ts so that
# the backend containment check matches the frontend's hit-testing exactly.
_PX_PER_M: int = 28
_MIN_CANVAS_WIDTH_PX: int = 280
_MIN_CANVAS_HEIGHT_PX: int = 180
_MIN_AREA_WIDTH_PX: int = 40
_MIN_AREA_HEIGHT_PX: int = 24
_MIN_TABLE_SIZE_PX: int = 32

router = APIRouter(
    prefix="/api/layouts",
    tags=["layouts"],
    dependencies=[Depends(require_admin)],
)


# ---------------------------------------------------------------------------
# Create layout
# ---------------------------------------------------------------------------


@router.post("", response_model=LayoutOut, status_code=status.HTTP_201_CREATED)
async def create_layout(
    body: LayoutCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    resolved_day_id, resolved_date = await _resolve_layout_day(db, body)
    existing_stmt = select(Layout).where(
        Layout.room_id == body.room_id,
        Layout.day_id == resolved_day_id,
    )
    if body.edition_id is None:
        existing_stmt = existing_stmt.where(Layout.edition_id.is_(None))
    else:
        existing_stmt = existing_stmt.where(Layout.edition_id == body.edition_id)

    existing = (await db.execute(existing_stmt.limit(1))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A layout already exists for this room and day.",
        )

    lay = Layout(
        id=make_id("lay"),
        edition_id=body.edition_id,
        room_id=body.room_id,
        day_id=resolved_day_id,
        label=body.label.strip(),
    )
    db.add(lay)
    await db.commit()
    await db.refresh(lay)
    return layout_to_dict(lay, date=resolved_date)


@router.post("/{source_layout_id}/copy", response_model=LayoutOut, status_code=status.HTTP_201_CREATED)
async def copy_layout(
    source_layout_id: str,
    body: LayoutCopyCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    source = await _get_or_404(db, source_layout_id)
    resolved_day_id, resolved_date = await _resolve_layout_day(db, body)

    existing_stmt = select(Layout).where(
        Layout.room_id == body.room_id,
        Layout.day_id == resolved_day_id,
    )
    if body.edition_id is None:
        existing_stmt = existing_stmt.where(Layout.edition_id.is_(None))
    else:
        existing_stmt = existing_stmt.where(Layout.edition_id == body.edition_id)
    existing = (await db.execute(existing_stmt.limit(1))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A layout already exists for this room and day.",
        )

    room_stmt = select(Room).where(Room.id == source.room_id)
    source_room = (await db.execute(room_stmt)).scalar_one_or_none()
    if source_room is None:
        raise HTTPException(status_code=404, detail="Source room not found.")

    source_tables = (await db.execute(select(Table).where(Table.layout_id == source_layout_id))).scalars().all()
    source_areas = (await db.execute(select(Area).where(Area.layout_id == source_layout_id))).scalars().all()

    table_type_ids = {t.table_type_id for t in source_tables}
    table_types: dict[str, TableType] = {}
    if table_type_ids:
        result = await db.execute(select(TableType).where(TableType.id.in_(table_type_ids)))
        table_types = {tt.id: tt for tt in result.scalars().all()}

    cloned = Layout(
        id=make_id("lay"),
        edition_id=body.edition_id,
        room_id=body.room_id,
        day_id=resolved_day_id,
        label=body.label.strip(),
    )
    db.add(cloned)
    await db.flush()

    # Tables inside areas travel with copy_areas; tables outside areas travel with copy_tables.
    all_areas = list(source_areas)
    tables_inside: list[Table] = []
    if body.copy_areas and all_areas:
        tables_inside = [
            table for table in source_tables if _table_in_any_area(table, all_areas, table_types, source_room)
        ]

    tables_outside: list[Table] = []
    if body.copy_tables:
        if all_areas:
            tables_outside = [
                table for table in source_tables if not _table_in_any_area(table, all_areas, table_types, source_room)
            ]
        else:
            tables_outside = list(source_tables)

    tables_to_copy = tables_inside + tables_outside

    for table in tables_to_copy:
        db.add(
            Table(
                id=make_id("tbl"),
                name=table.name,
                capacity=table.capacity,
                x=table.x,
                y=table.y,
                table_type_id=table.table_type_id,
                rotation=table.rotation,
                layout_id=cloned.id,
                reservation_ids=[],
            )
        )

    if body.copy_areas:
        for area in source_areas:
            db.add(
                Area(
                    id=make_id("area"),
                    layout_id=cloned.id,
                    label=area.label,
                    icon=area.icon,
                    exhibitor_id=area.exhibitor_id,
                    width_m=area.width_m,
                    length_m=area.length_m,
                    x=area.x,
                    y=area.y,
                    rotation=area.rotation,
                )
            )

    await db.commit()
    await db.refresh(cloned)
    return layout_to_dict(cloned, date=resolved_date)


# ---------------------------------------------------------------------------
# List layouts
# ---------------------------------------------------------------------------


@router.get("", response_model=list[LayoutOut])
async def list_layouts(
    db: AsyncSession = Depends(get_db),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    stmt = select(Layout).order_by(Layout.created_at).offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    layouts = result.scalars().all()
    return await _layout_payloads(db, list(layouts))


# ---------------------------------------------------------------------------
# Get single layout
# ---------------------------------------------------------------------------


@router.get("/{layout_id}", response_model=LayoutOut)
async def get_layout(layout_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    payloads = await _layout_payloads(db, [await _get_or_404(db, layout_id)])
    return payloads[0]


# ---------------------------------------------------------------------------
# Delete layout
# ---------------------------------------------------------------------------


@router.delete("/{layout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_layout(layout_id: str, db: AsyncSession = Depends(get_db)) -> None:
    lay = await _get_or_404(db, layout_id)
    tables_in_use = await db.execute(select(Table).where(Table.layout_id == layout_id).limit(1))
    if tables_in_use.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete: tables are still assigned to this layout.",
        )
    await db.delete(lay)
    await db.commit()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def _get_or_404(db: AsyncSession, layout_id: str) -> Layout:
    result = await db.execute(select(Layout).where(Layout.id == layout_id))
    lay = result.scalar_one_or_none()
    if lay is None:
        raise HTTPException(status_code=404, detail="Layout not found.")
    return lay


async def _layout_payloads(db: AsyncSession, layouts: list[Layout]) -> list[dict]:
    edition_ids = {layout.edition_id for layout in layouts if layout.edition_id}
    edition_dates_by_id: dict[str, list] = {}
    if edition_ids:
        result = await db.execute(
            select(Edition).options(selectinload(Edition.events)).where(Edition.id.in_(edition_ids))
        )
        for edition in result.scalars().all():
            edition_dates_by_id[edition.id] = sorted({event.date for event in edition.events})

    payloads: list[dict] = []
    for layout in layouts:
        date = None
        if layout.edition_id and layout.edition_id in edition_dates_by_id:
            dates = edition_dates_by_id[layout.edition_id]
            if 1 <= layout.day_id <= len(dates):
                date = dates[layout.day_id - 1]
        payloads.append(layout_to_dict(layout, date=date))
    return payloads


async def _resolve_layout_day(db: AsyncSession, body: LayoutCreate) -> tuple[int, date | None]:
    if body.date is None:
        return body.day_id or 1, None
    if not body.edition_id:
        raise HTTPException(status_code=400, detail="edition_id is required when date is provided.")

    result = await db.execute(
        select(Edition).options(selectinload(Edition.events)).where(Edition.id == body.edition_id)
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found.")

    unique_dates = sorted({event.date for event in edition.events})
    if body.date not in unique_dates:
        raise HTTPException(
            status_code=400,
            detail="Layout date must match one of the edition event dates.",
        )
    return unique_dates.index(body.date) + 1, body.date


def _table_in_any_area(
    table: Table,
    areas: list[Area],
    table_types: dict[str, TableType],
    room: Room,
) -> bool:
    """Return True if the table's centre falls inside any of the given areas.

    All geometry is computed in pixel space using the same rounding and minimum
    rendered dimensions as the frontend (layoutUtils.ts / getAreaSizePx /
    getTableSizePx), so the result matches what the user sees in the editor.
    """
    # Effective canvas dimensions (pixels) — match getCanvasSizePx
    canvas_w = max(_MIN_CANVAS_WIDTH_PX, round(room.width_m * _PX_PER_M))
    canvas_h = max(_MIN_CANVAS_HEIGHT_PX, round(room.length_m * _PX_PER_M))

    # Effective table size (pixels) — match getTableSizePx
    table_type = table_types.get(table.table_type_id)
    table_w_px = max(_MIN_TABLE_SIZE_PX, round((table_type.width_m if table_type else 1.0) * _PX_PER_M))
    table_h_px = max(_MIN_TABLE_SIZE_PX, round((table_type.length_m if table_type else 1.0) * _PX_PER_M))

    # Table centre in canvas pixels
    table_cx = (table.x / 100.0) * canvas_w + table_w_px / 2.0
    table_cy = (table.y / 100.0) * canvas_h + table_h_px / 2.0

    for area in areas:
        # Effective area size (pixels) — match getAreaSizePx
        area_w_px = max(_MIN_AREA_WIDTH_PX, round(area.width_m * _PX_PER_M))
        area_h_px = max(_MIN_AREA_HEIGHT_PX, round(area.length_m * _PX_PER_M))

        # Area centre in canvas pixels
        area_left = (area.x / 100.0) * canvas_w
        area_top = (area.y / 100.0) * canvas_h
        area_cx = area_left + area_w_px / 2.0
        area_cy = area_top + area_h_px / 2.0

        # Rotate table centre into area-local space (negate rotation to invert)
        radians = -((area.rotation or 0) * math.pi / 180.0)
        cos_v = math.cos(radians)
        sin_v = math.sin(radians)

        dx = table_cx - area_cx
        dy = table_cy - area_cy
        lx = cos_v * dx - sin_v * dy
        ly = sin_v * dx + cos_v * dy

        if abs(lx) <= area_w_px / 2.0 and abs(ly) <= area_h_px / 2.0:
            return True
    return False
