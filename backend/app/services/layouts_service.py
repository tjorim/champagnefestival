"""Shared application-service operations for floor-plan layouts.

Used by both ``app.routers.layouts`` (REST) and ``app.mcp.admin.layouts``
(MCP) so validation, row locking, cascade guards, and audit-detail
construction live in exactly one place instead of being duplicated between
the two surfaces (see issue #807). Callers pass an already-open
``AsyncSession`` and a validated Pydantic schema instance; each adapter is
responsible for opening/closing the session and translating a
``ServiceError`` into its own error convention (see ``app/services/errors.py``).
"""

from __future__ import annotations

import math
from datetime import date as dt_date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.models import Area, Edition, Exhibitor, Layout, Registration, Room, Table, TableType
from app.schemas import LayoutCopyCreate, LayoutCreate
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.services.idempotency import (
    check_idempotency_key,
    commit_with_idempotency_guard,
    hash_request,
    record_idempotency_key,
)
from app.utils import area_to_dict, layout_to_dict, make_id, table_to_dict

_BULK_SCOPE = "layouts.bulk_create"

# Mirror the rendering constants from frontend/src/utils/layoutUtils.ts so that
# the backend containment check matches the frontend's hit-testing exactly.
_PX_PER_M: int = 28
_MIN_CANVAS_WIDTH_PX: int = 280
_MIN_CANVAS_HEIGHT_PX: int = 180
_MIN_AREA_WIDTH_PX: int = 40
_MIN_AREA_HEIGHT_PX: int = 24
_MIN_TABLE_SIZE_PX: int = 32


def _js_round(x: float) -> int:
    """Round a non-negative float the same way JS Math.round does.

    Python's built-in round() uses banker's rounding (round half to even),
    whereas JS Math.round always rounds 0.5 up (towards +∞).  For the
    positive pixel values we deal with here the difference is:
      Python: round(0.5) == 0   JS: Math.round(0.5) == 1
    Using math.floor(x + 0.5) reproduces the JS behaviour for x >= 0.
    """
    return math.floor(x + 0.5)


def table_in_any_area(
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
    canvas_w = max(_MIN_CANVAS_WIDTH_PX, room.width_m * _PX_PER_M)
    canvas_h = max(_MIN_CANVAS_HEIGHT_PX, room.length_m * _PX_PER_M)

    # Effective table size (pixels) — match getTableSizePx
    table_type = table_types.get(table.table_type_id)
    table_w_px = max(_MIN_TABLE_SIZE_PX, _js_round((table_type.width_m if table_type else 1.0) * _PX_PER_M))
    table_h_px = max(_MIN_TABLE_SIZE_PX, _js_round((table_type.length_m if table_type else 1.0) * _PX_PER_M))

    # Table centre in canvas pixels
    table_cx = (table.x / 100.0) * canvas_w + table_w_px / 2.0
    table_cy = (table.y / 100.0) * canvas_h + table_h_px / 2.0

    for area in areas:
        # Effective area size (pixels) — match getAreaSizePx
        area_w_px = max(_MIN_AREA_WIDTH_PX, _js_round(area.width_m * _PX_PER_M))
        area_h_px = max(_MIN_AREA_HEIGHT_PX, _js_round(area.length_m * _PX_PER_M))

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


async def resolve_layout_day(db: AsyncSession, body: LayoutCreate | LayoutCopyCreate) -> tuple[int, dt_date | None]:
    if body.date is None:
        return body.day_id or 1, None
    if not body.edition_id:
        raise ValidationFailedError("edition_id is required when date is provided.")

    result = await db.execute(
        select(Edition).options(selectinload(Edition.events)).where(Edition.id == body.edition_id)
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        raise NotFoundError("Edition not found.")

    unique_dates = sorted({event.date for event in edition.events})
    if body.date not in unique_dates:
        raise ValidationFailedError("Layout date must match one of the edition event dates.")
    return unique_dates.index(body.date) + 1, body.date


async def layout_payloads(db: AsyncSession, layouts: list[Layout]) -> list[dict]:
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


async def _reject_if_duplicate(db: AsyncSession, *, room_id: str, day_id: int, edition_id: str | None) -> None:
    existing_stmt = select(Layout).where(Layout.room_id == room_id, Layout.day_id == day_id)
    existing_stmt = (
        existing_stmt.where(Layout.edition_id.is_(None))
        if edition_id is None
        else existing_stmt.where(Layout.edition_id == edition_id)
    )
    existing = (await db.execute(existing_stmt.limit(1))).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("A layout already exists for this room and day.")


async def create_layout(
    db: AsyncSession,
    *,
    actor: str,
    body: LayoutCreate,
    request_id: str | None = None,
) -> dict:
    resolved_day_id, resolved_date = await resolve_layout_day(db, body)

    # Lock the room row so a concurrent room deletion (which refuses to proceed
    # while layouts reference the room) can't race this insert: whichever
    # transaction locks the room first is the one the other serializes behind.
    # Also doubles as the room-existence check — an unchecked bogus room_id
    # would otherwise surface as a raw FK IntegrityError instead of a clean,
    # uniform NotFoundError.
    locked_room = (
        await db.execute(select(Room.id).where(Room.id == body.room_id).with_for_update())
    ).scalar_one_or_none()
    if locked_room is None:
        raise NotFoundError(f"Room '{body.room_id}' not found.")

    await _reject_if_duplicate(db, room_id=body.room_id, day_id=resolved_day_id, edition_id=body.edition_id)

    lay = Layout(
        id=make_id("lay"),
        edition_id=body.edition_id,
        room_id=body.room_id,
        day_id=resolved_day_id,
        label=body.label.strip(),
    )
    db.add(lay)
    await write_audit_entry(
        db,
        actor=actor,
        action="layout_created",
        resource_type="layout",
        resource_id=lay.id,
        request_id=request_id,
        details={"room_id": lay.room_id, "day_id": lay.day_id},
    )
    await db.commit()
    await db.refresh(lay)
    return layout_to_dict(lay, date=resolved_date)


async def bulk_create_layouts(
    db: AsyncSession,
    *,
    actor: str,
    items: list[LayoutCreate],
    idempotency_key: str | None = None,
    request_id: str | None = None,
) -> dict:
    """Create several layouts in a single transaction; all-or-nothing (#837).

    Rejects duplicate room+day+edition combinations both against existing
    rows (``_reject_if_duplicate``) and *within* the batch itself, since
    nothing in the batch is flushed until every item has passed validation.
    See ``app.services.idempotency`` for the retry-safety contract of
    ``idempotency_key``.
    """
    request_hash = hash_request([item.model_dump(mode="json") for item in items])
    if idempotency_key:
        cached = await check_idempotency_key(
            db, scope=_BULK_SCOPE, key=idempotency_key, actor=actor, request_hash=request_hash
        )
        if cached is not None:
            return cached

    # Lock every referenced room up front — also doubles as the existence
    # check, same as create_layout. Ordered by id so two overlapping batches
    # always acquire their locks in the same sequence and can't deadlock.
    room_ids = {item.room_id for item in items}
    locked_rooms = await db.execute(select(Room.id).where(Room.id.in_(room_ids)).order_by(Room.id).with_for_update())
    missing_rooms = room_ids - set(locked_rooms.scalars().all())
    if missing_rooms:
        raise NotFoundError(f"Room(s) not found: {sorted(missing_rooms)}.")

    resolved_days: list[int] = []
    resolved_dates: list[dt_date | None] = []
    seen_in_batch: set[tuple[str, int, str | None]] = set()
    for item in items:
        day_id, date = await resolve_layout_day(db, item)
        dedupe_key = (item.room_id, day_id, item.edition_id)
        if dedupe_key in seen_in_batch:
            raise ConflictError(f"Duplicate layout for room '{item.room_id}' and day {day_id} within this batch.")
        seen_in_batch.add(dedupe_key)
        await _reject_if_duplicate(db, room_id=item.room_id, day_id=day_id, edition_id=item.edition_id)
        resolved_days.append(day_id)
        resolved_dates.append(date)

    rows = [
        Layout(
            id=make_id("lay"),
            edition_id=item.edition_id,
            room_id=item.room_id,
            day_id=day_id,
            label=item.label.strip(),
        )
        for item, day_id in zip(items, resolved_days, strict=True)
    ]
    db.add_all(rows)
    await db.flush()

    for lay in rows:
        await write_audit_entry(
            db,
            actor=actor,
            action="layout_created",
            resource_type="layout",
            resource_id=lay.id,
            request_id=request_id,
            details={"room_id": lay.room_id, "day_id": lay.day_id, "bulk": True},
        )

    response = {"items": [layout_to_dict(lay, date=date) for lay, date in zip(rows, resolved_dates, strict=True)]}
    if idempotency_key:
        record_idempotency_key(
            db, scope=_BULK_SCOPE, key=idempotency_key, actor=actor, request_hash=request_hash, response_body=response
        )
    await commit_with_idempotency_guard(db, idempotency_key=idempotency_key)
    return response


async def copy_layout(
    db: AsyncSession,
    *,
    actor: str,
    source_layout_id: str,
    body: LayoutCopyCreate,
    request_id: str | None = None,
) -> dict:
    source = await db.get(Layout, source_layout_id)
    if source is None:
        raise NotFoundError(f"Layout '{source_layout_id}' not found.")

    resolved_day_id, resolved_date = await resolve_layout_day(db, body)

    # See create_layout: lock the target room (also doubling as the existence
    # check) so it can't be deleted out from under this insert.
    locked_target_room = (
        await db.execute(select(Room.id).where(Room.id == body.room_id).with_for_update())
    ).scalar_one_or_none()
    if locked_target_room is None:
        raise NotFoundError(f"Room '{body.room_id}' not found.")

    await _reject_if_duplicate(db, room_id=body.room_id, day_id=resolved_day_id, edition_id=body.edition_id)

    room_stmt = select(Room).where(Room.id == source.room_id)
    source_room = (await db.execute(room_stmt)).scalar_one_or_none()
    if source_room is None:
        raise NotFoundError("Source room not found.")

    source_tables = (await db.execute(select(Table).where(Table.layout_id == source_layout_id))).scalars().all()
    source_areas = (await db.execute(select(Area).where(Area.layout_id == source_layout_id))).scalars().all()

    # Validate inactive exhibitors before creating any pending inserts — fail fast
    # before db.add(cloned) / db.flush() or table copies.
    if body.copy_areas:
        exhibitor_ids = {area.exhibitor_id for area in source_areas if area.exhibitor_id is not None}
        if exhibitor_ids:
            active_result = await db.execute(
                select(Exhibitor.id).where(Exhibitor.id.in_(exhibitor_ids), Exhibitor.active.is_(True))
            )
            active_ids = set(active_result.scalars().all())
            inactive_ids = sorted(exhibitor_ids - active_ids)
            if inactive_ids:
                raise ValidationFailedError(
                    "Cannot copy: the following areas reference an inactive or "
                    f"deleted exhibitor: {inactive_ids}. Update those areas first."
                )

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
            table for table in source_tables if table_in_any_area(table, all_areas, table_types, source_room)
        ]

    tables_outside: list[Table] = []
    if body.copy_tables:
        if body.copy_areas and all_areas:
            tables_outside = [
                table for table in source_tables if not table_in_any_area(table, all_areas, table_types, source_room)
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

    await write_audit_entry(
        db,
        actor=actor,
        action="layout_copied",
        resource_type="layout",
        resource_id=cloned.id,
        request_id=request_id,
        details={"source_layout_id": source_layout_id, "room_id": cloned.room_id, "day_id": cloned.day_id},
    )
    await db.commit()
    await db.refresh(cloned)
    return layout_to_dict(cloned, date=resolved_date)


async def list_layouts(
    db: AsyncSession,
    *,
    limit: int | None = None,
    offset: int = 0,
    edition_id: str | None = None,
    room_id: str | None = None,
) -> list[dict]:
    stmt = select(Layout).order_by(Layout.created_at, Layout.id).offset(offset)
    if edition_id is not None:
        stmt = stmt.where(Layout.edition_id == edition_id)
    if room_id is not None:
        stmt = stmt.where(Layout.room_id == room_id)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    layouts = list(result.scalars().all())
    return await layout_payloads(db, layouts)


async def get_layout(db: AsyncSession, layout_id: str, *, include_tables: bool = False) -> dict:
    if include_tables:
        result = await db.execute(
            select(Layout)
            .options(selectinload(Layout.tables), selectinload(Layout.areas))
            .where(Layout.id == layout_id)
        )
        lay = result.scalar_one_or_none()
    else:
        lay = await db.get(Layout, layout_id)
    if lay is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    payloads = await layout_payloads(db, [lay])
    payload = payloads[0]
    if include_tables:
        table_ids = [t.id for t in lay.tables]
        table_res_map: dict[str, list[str]] = {}
        if table_ids:
            res_result = await db.execute(
                select(Registration.id, Registration.table_id).where(Registration.table_id.in_(table_ids))
            )
            for res_id, tbl_id in res_result.all():
                table_res_map.setdefault(tbl_id, []).append(res_id)
        payload["tables"] = [table_to_dict(t, table_res_map.get(t.id, [])) for t in lay.tables]
        payload["areas"] = [area_to_dict(a) for a in lay.areas]
    return payload


async def delete_layout(db: AsyncSession, *, actor: str, layout_id: str, request_id: str | None = None) -> dict:
    lay = await db.get(Layout, layout_id)
    if lay is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    # Lock the layout row so a concurrent table creation/copy (which validates the
    # layout exists before inserting) can't race this delete: whichever
    # transaction locks the layout first is the one the other serializes behind.
    await db.execute(select(Layout.id).where(Layout.id == layout_id).with_for_update())
    tables_in_use = await db.execute(select(Table).where(Table.layout_id == layout_id).limit(1))
    if tables_in_use.scalars().first() is not None:
        raise ConflictError("Cannot delete: tables are still assigned to this layout.")
    await db.delete(lay)
    await write_audit_entry(
        db,
        actor=actor,
        action="layout_deleted",
        resource_type="layout",
        resource_id=layout_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "id": layout_id}
