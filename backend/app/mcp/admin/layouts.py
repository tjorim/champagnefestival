"""Admin (write) MCP tool implementations for floor-plan layout management.

Mirrors ``app.routers.layouts``. ``copy_layout`` reuses the router's geometry
helpers directly (``_table_in_any_area``, ``_resolve_layout_day``) rather than
re-deriving the pixel-space containment math, so floor-plan copies classify
tables inside/outside areas identically to the REST endpoint and the
frontend editor.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import select

from app.audit import write_audit_entry
from app.mcp.utils import as_value_error, get_or_error, validate_with_schema
from app.models import Area, Exhibitor, Layout, Room, Table, TableType
from app.routers.layouts import _layout_payloads, _resolve_layout_day, _table_in_any_area
from app.schemas import LayoutCopyCreate, LayoutCreate
from app.utils import layout_to_dict, make_id


async def create_layout(
    session_factory: Any,
    actor: str,
    *,
    room_id: str,
    edition_id: str | None = None,
    day_id: int | None = None,
    date: Any = None,
    label: str = "",
) -> dict:
    body = validate_with_schema(
        LayoutCreate,
        room_id=room_id,
        edition_id=edition_id,
        day_id=day_id,
        date=date,
        label=label,
    )
    async with session_factory() as db:
        try:
            resolved_day_id, resolved_date = await _resolve_layout_day(db, body)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        # Lock the room row so a concurrent room deletion (which refuses to proceed
        # while layouts reference the room) can't race this insert: whichever
        # transaction locks the room first is the one the other serializes behind.
        # Also doubles as the room-existence check — an unchecked bogus room_id
        # would otherwise surface as a raw FK IntegrityError instead of a clean
        # ValueError, unlike every other create tool in this module.
        locked_room = (
            await db.execute(select(Room.id).where(Room.id == body.room_id).with_for_update())
        ).scalar_one_or_none()
        if locked_room is None:
            raise ValueError(f"Room '{body.room_id}' not found.")

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
            raise ValueError("A layout already exists for this room and day.")

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
            details={"room_id": lay.room_id, "day_id": lay.day_id},
        )
        await db.commit()
        await db.refresh(lay)
        return layout_to_dict(lay, date=resolved_date)


async def copy_layout(
    session_factory: Any,
    actor: str,
    source_layout_id: str,
    *,
    room_id: str,
    edition_id: str | None = None,
    day_id: int | None = None,
    date: Any = None,
    label: str = "",
    copy_tables: bool = True,
    copy_areas: bool = True,
) -> dict:
    body = validate_with_schema(
        LayoutCopyCreate,
        room_id=room_id,
        edition_id=edition_id,
        day_id=day_id,
        date=date,
        label=label,
        copy_tables=copy_tables,
        copy_areas=copy_areas,
    )
    async with session_factory() as db:
        source = await get_or_error(db, Layout, source_layout_id, f"Layout '{source_layout_id}' not found.")
        try:
            resolved_day_id, resolved_date = await _resolve_layout_day(db, body)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        # See create_layout: lock the target room (also doubling as the
        # existence check) so it can't be deleted out from under this insert.
        locked_target_room = (
            await db.execute(select(Room.id).where(Room.id == body.room_id).with_for_update())
        ).scalar_one_or_none()
        if locked_target_room is None:
            raise ValueError(f"Room '{body.room_id}' not found.")

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
            raise ValueError("A layout already exists for this room and day.")

        room_stmt = select(Room).where(Room.id == source.room_id)
        source_room = (await db.execute(room_stmt)).scalar_one_or_none()
        if source_room is None:
            raise ValueError("Source room not found.")

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
            if body.copy_areas and all_areas:
                tables_outside = [
                    table
                    for table in source_tables
                    if not _table_in_any_area(table, all_areas, table_types, source_room)
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
            # An area whose exhibitor was deactivated after the source area was
            # created (or last updated) must not be silently carried into the copy —
            # create_area/update_area both refuse to assign an inactive exhibitor,
            # so the copy path can't create areas those tools would reject.
            exhibitor_ids = {area.exhibitor_id for area in source_areas if area.exhibitor_id is not None}
            if exhibitor_ids:
                active_result = await db.execute(
                    select(Exhibitor.id).where(Exhibitor.id.in_(exhibitor_ids), Exhibitor.active.is_(True))
                )
                active_ids = set(active_result.scalars().all())
                inactive_ids = sorted(exhibitor_ids - active_ids)
                if inactive_ids:
                    raise ValueError(
                        "Cannot copy: the following areas reference an inactive or "
                        f"deleted exhibitor: {inactive_ids}. Update those areas first."
                    )
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
            details={"source_layout_id": source_layout_id, "room_id": cloned.room_id, "day_id": cloned.day_id},
        )
        await db.commit()
        await db.refresh(cloned)
        return layout_to_dict(cloned, date=resolved_date)


async def list_layouts(session_factory: Any) -> dict:
    async with session_factory() as db:
        result = await db.execute(select(Layout).order_by(Layout.created_at))
        layouts = list(result.scalars().all())
        return {"layouts": await _layout_payloads(db, layouts)}


async def get_layout(session_factory: Any, layout_id: str) -> dict:
    async with session_factory() as db:
        lay = await get_or_error(db, Layout, layout_id, f"Layout '{layout_id}' not found.")
        payloads = await _layout_payloads(db, [lay])
        return payloads[0]


async def delete_layout(session_factory: Any, actor: str, layout_id: str) -> dict:
    async with session_factory() as db:
        lay = await get_or_error(db, Layout, layout_id, f"Layout '{layout_id}' not found.")
        # Lock the layout row so a concurrent table creation/copy (which validates
        # the layout exists before inserting) can't race this delete: whichever
        # transaction locks the layout first is the one the other serializes behind.
        await db.execute(select(Layout.id).where(Layout.id == layout_id).with_for_update())
        tables_in_use = await db.execute(select(Table).where(Table.layout_id == layout_id).limit(1))
        if tables_in_use.scalars().first() is not None:
            raise ValueError("Cannot delete: tables are still assigned to this layout.")
        await db.delete(lay)
        await write_audit_entry(
            db,
            actor=actor,
            action="layout_deleted",
            resource_type="layout",
            resource_id=layout_id,
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": layout_id}
