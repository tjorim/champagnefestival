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

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.models import (
    Area,
    Edition,
    Event,
    Exhibitor,
    Layout,
    LayoutRevision,
    Registration,
    RegistrationAllocation,
    Room,
    Table,
    TableType,
)
from app.schemas import CURRENT_REVISION_REF, LayoutCopyCreate, LayoutCreate, LayoutRevisionSaveRequest
from app.services.allocations_service import registration_ids_by_table
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.services.idempotency import (
    check_idempotency_key,
    commit_with_idempotency_guard,
    hash_request,
    record_idempotency_key,
)
from app.utils import area_to_dict, layout_to_dict, make_id, table_to_dict

_BULK_SCOPE = "layouts.bulk_create"

# Fields compared between two table/area snapshot entries matched by stable id
# (see _diff_objects). Geometry/type fields also decide whether a restore
# would "move" a table for allocation-conflict purposes — see
# _GEOMETRY_TABLE_FIELDS below.
_TABLE_DIFF_FIELDS = (
    "name",
    "x",
    "y",
    "rotation",
    "table_type_id",
    "table_type_name",
    "capacity",
    "width_m",
    "length_m",
)
_AREA_DIFF_FIELDS = ("label", "icon", "x", "y", "rotation", "width_m", "length_m")
_GEOMETRY_TABLE_FIELDS = frozenset({"x", "y", "rotation", "table_type_id"})

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


async def resolve_layout_event(db: AsyncSession, body: LayoutCreate) -> dt_date:
    event = (await db.execute(select(Event).where(Event.id == body.event_id).with_for_update())).scalar_one_or_none()
    if event is None:
        raise NotFoundError("Event not found.")
    room = (
        await db.execute(
            select(Room).where(Room.id == body.room_id).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    edition = await db.get(Edition, event.edition_id)
    if room is not None and edition is not None and room.venue_id != edition.venue_id:
        raise ValidationFailedError("The room must belong to the event venue.")
    return event.date


async def layout_payloads(db: AsyncSession, layouts: list[Layout]) -> list[dict]:
    return [layout_to_dict(layout, date=layout.event.date) for layout in layouts]


async def _reject_if_duplicate(db: AsyncSession, *, room_id: str, event_id: str) -> None:
    existing = (
        await db.execute(select(Layout.id).where(Layout.room_id == room_id, Layout.event_id == event_id).limit(1))
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("A layout already exists for this room and event.")


async def create_layout(
    db: AsyncSession,
    *,
    actor: str,
    body: LayoutCreate,
    request_id: str | None = None,
) -> dict:
    resolved_date = await resolve_layout_event(db, body)

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

    await _reject_if_duplicate(db, room_id=body.room_id, event_id=body.event_id)

    lay = Layout(
        id=make_id("lay"),
        event_id=body.event_id,
        room_id=body.room_id,
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
        details={"room_id": lay.room_id, "event_id": lay.event_id},
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
    await db.execute(
        select(Event.id).where(Event.id.in_({item.event_id for item in items})).order_by(Event.id).with_for_update()
    )
    room_ids = {item.room_id for item in items}
    locked_rooms = await db.execute(select(Room.id).where(Room.id.in_(room_ids)).order_by(Room.id).with_for_update())
    missing_rooms = room_ids - set(locked_rooms.scalars().all())
    if missing_rooms:
        raise NotFoundError(f"Room(s) not found: {sorted(missing_rooms)}.")

    resolved_dates: list[dt_date] = []
    seen_in_batch: set[tuple[str, str]] = set()
    for item in items:
        date = await resolve_layout_event(db, item)
        dedupe_key = (item.room_id, item.event_id)
        if dedupe_key in seen_in_batch:
            raise ConflictError("Duplicate layout for room and event within this batch.")
        seen_in_batch.add(dedupe_key)
        await _reject_if_duplicate(db, room_id=item.room_id, event_id=item.event_id)
        resolved_dates.append(date)
    rows = [
        Layout(id=make_id("lay"), event_id=item.event_id, room_id=item.room_id, label=item.label.strip())
        for item in items
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
            details={"room_id": lay.room_id, "event_id": lay.event_id, "bulk": True},
        )

    # layout_to_dict() reads edition_id via lay.event, which flush() does not
    # populate on these freshly constructed rows — reload with it so the
    # hybrid property doesn't need an implicit (and, under AsyncSession,
    # unsafe) lazy load during serialization.
    reloaded = {
        lay.id: lay
        for lay in (await db.execute(select(Layout).where(Layout.id.in_([lay.id for lay in rows])))).scalars().all()
    }
    response = {
        "items": [layout_to_dict(reloaded[lay.id], date=date) for lay, date in zip(rows, resolved_dates, strict=True)]
    }
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

    resolved_date = await resolve_layout_event(db, body)

    # See create_layout: lock the target room (also doubling as the existence
    # check) so it can't be deleted out from under this insert.
    locked_target_room = (
        await db.execute(select(Room.id).where(Room.id == body.room_id).with_for_update())
    ).scalar_one_or_none()
    if locked_target_room is None:
        raise NotFoundError(f"Room '{body.room_id}' not found.")

    await _reject_if_duplicate(db, room_id=body.room_id, event_id=body.event_id)

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
        event_id=body.event_id,
        room_id=body.room_id,
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
                x=table.x,
                y=table.y,
                table_type_id=table.table_type_id,
                rotation=table.rotation,
                layout_id=cloned.id,
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
        details={"source_layout_id": source_layout_id, "room_id": cloned.room_id, "event_id": cloned.event_id},
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
    event_id: str | None = None,
) -> list[dict]:
    stmt = select(Layout).order_by(Layout.created_at, Layout.id).offset(offset)
    if edition_id is not None:
        stmt = stmt.where(Layout.edition_id == edition_id)
    if event_id is not None:
        stmt = stmt.where(Layout.event_id == event_id)
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
        table_res_map = await registration_ids_by_table(db, table_ids)
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


# ---------------------------------------------------------------------------
# Layout revisions (#1021)
# ---------------------------------------------------------------------------


def _revision_to_dict(rev: LayoutRevision) -> dict:
    return {
        "id": rev.id,
        "layout_id": rev.layout_id,
        "revision_number": rev.revision_number,
        "label": rev.label,
        "change_note": rev.change_note,
        "created_by": rev.created_by,
        "created_at": rev.created_at,
        "snapshot": rev.snapshot,
    }


async def _build_snapshot(db: AsyncSession, layout: Layout) -> dict:
    """Build a geometry-only, stable-identity snapshot of a layout's current
    tables and areas — the shared shape used both when saving a revision and
    when treating the live layout as the ``current`` side of a compare/restore
    preview. Excludes allocations (registrations, ``Area.exhibitor_id``): those
    remain live operational data, never captured or restored by a revision."""
    tables = (
        (await db.execute(select(Table).where(Table.layout_id == layout.id).order_by(Table.created_at, Table.id)))
        .scalars()
        .all()
    )
    areas = (
        (await db.execute(select(Area).where(Area.layout_id == layout.id).order_by(Area.created_at, Area.id)))
        .scalars()
        .all()
    )
    room = await db.get(Room, layout.room_id)
    if room is None:
        raise NotFoundError(f"Room '{layout.room_id}' not found.")
    table_type_ids = {t.table_type_id for t in tables}
    table_types: dict[str, TableType] = {}
    if table_type_ids:
        result = await db.execute(select(TableType).where(TableType.id.in_(table_type_ids)))
        table_types = {tt.id: tt for tt in result.scalars().all()}

    return {
        "tables": [
            {
                "id": t.id,
                "name": t.name,
                "x": t.x,
                "y": t.y,
                "rotation": t.rotation,
                "table_type_id": t.table_type_id,
                "table_type_name": table_types[t.table_type_id].name,
                "capacity": table_types[t.table_type_id].capacity,
                "width_m": table_types[t.table_type_id].width_m,
                "length_m": table_types[t.table_type_id].length_m,
            }
            for t in tables
        ],
        "areas": [
            {
                "id": a.id,
                "label": a.label,
                "icon": a.icon,
                "x": a.x,
                "y": a.y,
                "rotation": a.rotation,
                "width_m": a.width_m,
                "length_m": a.length_m,
            }
            for a in areas
        ],
        "room": {"width_m": room.width_m, "length_m": room.length_m},
    }


async def save_layout_revision(
    db: AsyncSession,
    *,
    actor: str,
    layout_id: str,
    body: LayoutRevisionSaveRequest,
    request_id: str | None = None,
) -> dict:
    layout = await db.get(Layout, layout_id)
    if layout is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    # Lock the parent Layout row so two concurrent saves for the same layout
    # serialize rather than racing to compute the same MAX(revision_number)+1
    # (mirrors policies_service._get_policy_locked / create_draft). Locks by
    # bare id column, not the mapped entity: Layout.event is a joined eager
    # relationship, and Postgres refuses FOR UPDATE on an outer-joined SELECT.
    await db.execute(select(Layout.id).where(Layout.id == layout_id).with_for_update())

    highest = (
        await db.execute(select(func.max(LayoutRevision.revision_number)).where(LayoutRevision.layout_id == layout_id))
    ).scalar_one()
    snapshot = await _build_snapshot(db, layout)

    revision = LayoutRevision(
        id=make_id("layrev"),
        layout_id=layout_id,
        revision_number=1 if highest is None else highest + 1,
        label=body.label.strip(),
        change_note=body.change_note,
        created_by=actor,
        snapshot=snapshot,
    )
    db.add(revision)
    await write_audit_entry(
        db,
        actor=actor,
        action="layout_revision_saved",
        resource_type="layout_revision",
        resource_id=revision.id,
        request_id=request_id,
        details={"layout_id": layout_id, "revision_number": revision.revision_number},
    )
    await db.commit()
    await db.refresh(revision)
    return _revision_to_dict(revision)


async def list_layout_revisions(db: AsyncSession, layout_id: str) -> list[dict]:
    if await db.get(Layout, layout_id) is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    result = await db.execute(
        select(LayoutRevision)
        .where(LayoutRevision.layout_id == layout_id)
        .order_by(LayoutRevision.revision_number.desc())
    )
    return [_revision_to_dict(r) for r in result.scalars().all()]


async def _get_revision(db: AsyncSession, layout_id: str, revision_number: int) -> LayoutRevision:
    rev = (
        await db.execute(
            select(LayoutRevision).where(
                LayoutRevision.layout_id == layout_id, LayoutRevision.revision_number == revision_number
            )
        )
    ).scalar_one_or_none()
    if rev is None:
        raise NotFoundError(f"Layout '{layout_id}' has no revision {revision_number}.")
    return rev


async def get_layout_revision(db: AsyncSession, layout_id: str, revision_number: int) -> dict:
    return _revision_to_dict(await _get_revision(db, layout_id, revision_number))


async def _resolve_snapshot(db: AsyncSession, layout_id: str, ref: str) -> dict:
    """Resolve a compare/preview ref to a snapshot-shaped dict: either a stored
    revision's snapshot, or a freshly-built view of the live ``current`` layout."""
    if ref == CURRENT_REVISION_REF:
        layout = await db.get(Layout, layout_id)
        if layout is None:
            raise NotFoundError(f"Layout '{layout_id}' not found.")
        return await _build_snapshot(db, layout)
    try:
        revision_number = int(ref)
    except ValueError:
        raise ValidationFailedError(
            f"Invalid revision reference '{ref}': expected an integer revision number or '{CURRENT_REVISION_REF}'."
        ) from None
    return (await _get_revision(db, layout_id, revision_number)).snapshot


def _diff_objects(before: list[dict], after: list[dict], fields: tuple[str, ...]) -> tuple[list, list, list]:
    """Match ``before``/``after`` snapshot entries by stable ``id`` (never by
    the mutable ``name``/``label``) and report additions, removals, and
    field-level changes."""
    before_by_id = {item["id"]: item for item in before}
    after_by_id = {item["id"]: item for item in after}
    added = [item for item in after if item["id"] not in before_by_id]
    removed = [item for item in before if item["id"] not in after_by_id]
    changed = []
    for object_id, before_item in before_by_id.items():
        after_item = after_by_id.get(object_id)
        if after_item is None:
            continue
        changes = [
            {"field": field, "before": before_item[field], "after": after_item[field]}
            for field in fields
            if before_item[field] != after_item[field]
        ]
        if changes:
            changed.append({"id": object_id, "before": before_item, "after": after_item, "changes": changes})
    return added, removed, changed


async def compare_layout_revisions(db: AsyncSession, layout_id: str, from_ref: str, to_ref: str) -> dict:
    if await db.get(Layout, layout_id) is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    from_snapshot = await _resolve_snapshot(db, layout_id, from_ref)
    to_snapshot = await _resolve_snapshot(db, layout_id, to_ref)

    added_tables, removed_tables, changed_tables = _diff_objects(
        from_snapshot["tables"], to_snapshot["tables"], _TABLE_DIFF_FIELDS
    )
    added_areas, removed_areas, changed_areas = _diff_objects(
        from_snapshot["areas"], to_snapshot["areas"], _AREA_DIFF_FIELDS
    )
    return {
        "layout_id": layout_id,
        "from_ref": from_ref,
        "to_ref": to_ref,
        "added_tables": added_tables,
        "removed_tables": removed_tables,
        "changed_tables": changed_tables,
        "added_areas": added_areas,
        "removed_areas": removed_areas,
        "changed_areas": changed_areas,
    }


async def _allocation_conflicts(
    db: AsyncSession,
    *,
    current_tables_by_id: dict[str, dict],
    tables_to_remove: list[dict],
    tables_to_update: list[dict],
    areas_to_remove: list[dict],
) -> list[dict]:
    """Live allocations a restore would silently orphan: a table being deleted
    or having its geometry/type changed, or an area being deleted, while still
    holding a non-cancelled registration/exhibitor assignment. Restoring never
    touches ``Registration``/``Area.exhibitor_id`` itself — this only flags the
    conflict so the caller can make a deliberate ``resolve_allocations`` call."""
    removed_ids = {t["id"] for t in tables_to_remove}
    moved_ids = {t["id"] for t in tables_to_update if any(c["field"] in _GEOMETRY_TABLE_FIELDS for c in t["changes"])}
    at_risk_table_ids = removed_ids | moved_ids

    conflicts: list[dict] = []
    if at_risk_table_ids:
        rows = (
            await db.execute(
                select(Registration.id, RegistrationAllocation.table_id)
                .join(RegistrationAllocation, RegistrationAllocation.registration_id == Registration.id)
                .where(
                    RegistrationAllocation.table_id.in_(at_risk_table_ids),
                    Registration.status != "cancelled",
                )
            )
        ).all()
        registration_ids_by_table_id: dict[str, list[str]] = {}
        for registration_id, table_id in rows:
            registration_ids_by_table_id.setdefault(table_id, []).append(registration_id)
        for table_id, registration_ids in registration_ids_by_table_id.items():
            conflicts.append(
                {
                    "kind": "table",
                    "id": table_id,
                    "name": current_tables_by_id[table_id]["name"],
                    "reason": "deleted" if table_id in removed_ids else "moved",
                    "registration_ids": sorted(registration_ids),
                }
            )

    removed_area_ids = [a["id"] for a in areas_to_remove]
    if removed_area_ids:
        rows = (
            await db.execute(
                select(Area.id, Area.exhibitor_id, Area.label).where(
                    Area.id.in_(removed_area_ids), Area.exhibitor_id.isnot(None)
                )
            )
        ).all()
        for area_id, exhibitor_id, label in rows:
            conflicts.append(
                {"kind": "area", "id": area_id, "name": label, "reason": "deleted", "exhibitor_id": exhibitor_id}
            )
    return conflicts


async def _build_restore_plan(db: AsyncSession, layout: Layout, revision: LayoutRevision) -> dict:
    current_snapshot = await _build_snapshot(db, layout)
    target_snapshot = revision.snapshot

    tables_to_add, tables_to_remove, tables_to_update = _diff_objects(
        current_snapshot["tables"], target_snapshot["tables"], _TABLE_DIFF_FIELDS
    )
    areas_to_add, areas_to_remove, areas_to_update = _diff_objects(
        current_snapshot["areas"], target_snapshot["areas"], _AREA_DIFF_FIELDS
    )
    conflicts = await _allocation_conflicts(
        db,
        current_tables_by_id={t["id"]: t for t in current_snapshot["tables"]},
        tables_to_remove=tables_to_remove,
        tables_to_update=tables_to_update,
        areas_to_remove=areas_to_remove,
    )
    return {
        "layout_id": layout.id,
        "revision_number": revision.revision_number,
        "tables_to_add": tables_to_add,
        "tables_to_update": tables_to_update,
        "tables_to_remove": tables_to_remove,
        "areas_to_add": areas_to_add,
        "areas_to_update": areas_to_update,
        "areas_to_remove": areas_to_remove,
        "allocation_conflicts": conflicts,
        "has_conflicts": bool(conflicts),
    }


async def preview_layout_restore(db: AsyncSession, layout_id: str, revision_number: int) -> dict:
    layout = await db.get(Layout, layout_id)
    if layout is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    revision = await _get_revision(db, layout_id, revision_number)
    return await _build_restore_plan(db, layout, revision)


async def restore_layout_revision(
    db: AsyncSession,
    *,
    actor: str,
    layout_id: str,
    revision_number: int,
    resolve_allocations: bool = False,
    request_id: str | None = None,
) -> dict:
    layout = await db.get(Layout, layout_id)
    if layout is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    # Lock the parent Layout row: the plan computed below and the mutations
    # applied afterward must see (and hold against) one consistent state. See
    # save_layout_revision for why this locks the bare id column rather than
    # the mapped entity.
    await db.execute(select(Layout.id).where(Layout.id == layout_id).with_for_update())
    revision = await _get_revision(db, layout_id, revision_number)
    snapshot = revision.snapshot

    table_type_ids = {t["table_type_id"] for t in snapshot["tables"]}
    if table_type_ids:
        existing_type_ids = set(
            (await db.execute(select(TableType.id).where(TableType.id.in_(table_type_ids)))).scalars().all()
        )
        missing_type_ids = table_type_ids - existing_type_ids
        if missing_type_ids:
            raise ValidationFailedError(
                f"Cannot restore: table type(s) {sorted(missing_type_ids)} referenced by this revision no longer exist."
            )

    plan = await _build_restore_plan(db, layout, revision)
    if plan["allocation_conflicts"] and not resolve_allocations:
        raise ConflictError(
            "Restoring this revision would delete or move table(s)/area(s) with live "
            "allocations. Pass resolve_allocations=true to restore anyway."
        )

    current_tables = {
        t.id: t
        for t in (await db.execute(select(Table).where(Table.layout_id == layout_id).with_for_update())).scalars().all()
    }
    current_areas = {
        a.id: a
        for a in (await db.execute(select(Area).where(Area.layout_id == layout_id).with_for_update())).scalars().all()
    }
    snapshot_table_ids = {t["id"] for t in snapshot["tables"]}
    snapshot_area_ids = {a["id"] for a in snapshot["areas"]}

    tables_being_removed = [table_id for table_id in current_tables if table_id not in snapshot_table_ids]
    if tables_being_removed:
        # RegistrationAllocation.table_id is ON DELETE RESTRICT (a table can
        # normally never be deleted out from under a live booking — see
        # tables_service.delete_table): clear any allocation rows first so the
        # delete below doesn't hit that constraint. Live (non-cancelled)
        # allocations only reach here at all because the caller already
        # confirmed the conflict via resolve_allocations=True above; a
        # cancelled registration's stale allocation row is cleared either way
        # — its Registration row itself is never touched.
        await db.execute(
            delete(RegistrationAllocation).where(RegistrationAllocation.table_id.in_(tables_being_removed))
        )
    for table_id in tables_being_removed:
        await db.delete(current_tables[table_id])
    for area_id, area in current_areas.items():
        if area_id not in snapshot_area_ids:
            await db.delete(area)
    # Flush the deletes before checking id availability below — otherwise a
    # just-deleted row is still visible via db.get() (pending in the
    # identity map until flushed), and a recreate would wrongly mint a new id
    # instead of reusing the one this same restore just freed.
    await db.flush()

    for entry in snapshot["tables"]:
        existing = current_tables.get(entry["id"])
        if existing is not None:
            existing.name = entry["name"]
            existing.x = entry["x"]
            existing.y = entry["y"]
            existing.rotation = entry["rotation"]
            existing.table_type_id = entry["table_type_id"]
        else:
            reused_id = entry["id"] if await db.get(Table, entry["id"]) is None else make_id("tbl")
            db.add(
                Table(
                    id=reused_id,
                    name=entry["name"],
                    x=entry["x"],
                    y=entry["y"],
                    rotation=entry["rotation"],
                    table_type_id=entry["table_type_id"],
                    layout_id=layout_id,
                )
            )

    for entry in snapshot["areas"]:
        existing = current_areas.get(entry["id"])
        if existing is not None:
            existing.label = entry["label"]
            existing.icon = entry["icon"]
            existing.x = entry["x"]
            existing.y = entry["y"]
            existing.rotation = entry["rotation"]
            existing.width_m = entry["width_m"]
            existing.length_m = entry["length_m"]
        else:
            reused_id = entry["id"] if await db.get(Area, entry["id"]) is None else make_id("area")
            db.add(
                Area(
                    id=reused_id,
                    layout_id=layout_id,
                    label=entry["label"],
                    icon=entry["icon"],
                    x=entry["x"],
                    y=entry["y"],
                    rotation=entry["rotation"],
                    width_m=entry["width_m"],
                    length_m=entry["length_m"],
                )
            )

    await write_audit_entry(
        db,
        actor=actor,
        action="layout_revision_restored",
        resource_type="layout_revision",
        resource_id=revision.id,
        request_id=request_id,
        details={
            "layout_id": layout_id,
            "revision_number": revision_number,
            "resolve_allocations": resolve_allocations,
        },
    )
    await db.commit()
    return await get_layout(db, layout_id, include_tables=True)
