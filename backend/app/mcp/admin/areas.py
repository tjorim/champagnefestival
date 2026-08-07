"""Admin (write) MCP tool implementations for floor-plan area management.

Mirrors ``app.routers.areas``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.audit import write_audit_entry
from app.mcp.utils import get_or_error, validate_with_schema
from app.models import Area, Exhibitor, Layout
from app.schemas import AreaCreate, AreaUpdate
from app.utils import area_to_dict, make_id


async def create_area(
    session_factory: Any,
    actor: str,
    *,
    layout_id: str,
    label: str,
    icon: str = "bi-shop",
    exhibitor_id: int | None = None,
    width_m: float = 1.5,
    length_m: float = 1.0,
    x: float = 50.0,
    y: float = 50.0,
    rotation: int = 0,
) -> dict:
    body = validate_with_schema(
        AreaCreate,
        layout_id=layout_id,
        label=label,
        icon=icon,
        exhibitor_id=exhibitor_id,
        width_m=width_m,
        length_m=length_m,
        x=x,
        y=y,
        rotation=rotation,
    )
    async with session_factory() as db:
        lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
        if lay.scalar_one_or_none() is None:
            raise ValueError(f"Layout '{body.layout_id}' not found.")

        if body.exhibitor_id is not None:
            ex = await db.execute(select(Exhibitor).where(Exhibitor.id == body.exhibitor_id))
            exhibitor = ex.scalar_one_or_none()
            if exhibitor is None:
                raise ValueError(f"Exhibitor '{body.exhibitor_id}' not found.")
            if not exhibitor.active:
                raise ValueError(f"Exhibitor '{body.exhibitor_id}' is inactive.")

        a = Area(
            id=make_id("area"),
            layout_id=body.layout_id,
            label=body.label,
            icon=body.icon,
            exhibitor_id=body.exhibitor_id,
            width_m=body.width_m,
            length_m=body.length_m,
            x=body.x,
            y=body.y,
            rotation=body.rotation,
        )
        db.add(a)
        await write_audit_entry(
            db,
            actor=actor,
            action="area_created",
            resource_type="area",
            resource_id=a.id,
            details={"label": a.label, "layout_id": a.layout_id},
        )
        await db.commit()
        await db.refresh(a)
        return area_to_dict(a)


async def list_areas(session_factory: Any, layout_id: str | None = None) -> dict:
    async with session_factory() as db:
        stmt = select(Area).order_by(Area.created_at)
        if layout_id:
            stmt = stmt.where(Area.layout_id == layout_id)
        result = await db.execute(stmt)
        return {"areas": [area_to_dict(a) for a in result.scalars().all()]}


async def get_area(session_factory: Any, area_id: str) -> dict:
    async with session_factory() as db:
        a = await get_or_error(db, Area, area_id, f"Area '{area_id}' not found.")
        return area_to_dict(a)


async def update_area(
    session_factory: Any,
    actor: str,
    area_id: str,
    *,
    label: str | None = None,
    icon: str | None = None,
    exhibitor_id: int | None = None,
    clear_exhibitor_id: bool = False,
    width_m: float | None = None,
    length_m: float | None = None,
    x: float | None = None,
    y: float | None = None,
    rotation: int | None = None,
) -> dict:
    provided: dict[str, Any] = {
        k: v
        for k, v in {
            "label": label,
            "icon": icon,
            "width_m": width_m,
            "length_m": length_m,
            "x": x,
            "y": y,
            "rotation": rotation,
        }.items()
        if v is not None
    }
    # exhibitor_id has no natural "clear" sentinel (a real exhibitor id is
    # never legitimately blank), so clear_exhibitor_id distinguishes "leave
    # unchanged" (omitted, clear_exhibitor_id=False) from "explicitly unset"
    # (clear_exhibitor_id=True) the way REST distinguishes an absent JSON key
    # from an explicit ``null`` via ``model_fields_set``.
    if exhibitor_id is not None:
        provided["exhibitor_id"] = exhibitor_id
    elif clear_exhibitor_id:
        provided["exhibitor_id"] = None

    body = validate_with_schema(AreaUpdate, **provided)
    async with session_factory() as db:
        a = await get_or_error(db, Area, area_id, f"Area '{area_id}' not found.")

        if body.label is not None:
            a.label = body.label
        if body.icon is not None:
            a.icon = body.icon
        if body.x is not None:
            a.x = body.x
        if body.y is not None:
            a.y = body.y
        if body.width_m is not None:
            a.width_m = body.width_m
        if body.length_m is not None:
            a.length_m = body.length_m
        if body.rotation is not None:
            a.rotation = body.rotation
        if "exhibitor_id" in body.model_fields_set:
            if body.exhibitor_id is not None:
                ex = await db.execute(select(Exhibitor).where(Exhibitor.id == body.exhibitor_id))
                exhibitor = ex.scalar_one_or_none()
                if exhibitor is None:
                    raise ValueError("Exhibitor not found.")
                if not exhibitor.active:
                    raise ValueError("Exhibitor is inactive.")
            a.exhibitor_id = body.exhibitor_id

        await write_audit_entry(
            db,
            actor=actor,
            action="area_updated",
            resource_type="area",
            resource_id=a.id,
            details={"fields_changed": sorted(body.model_fields_set)},
        )
        await db.commit()
        await db.refresh(a)
        return area_to_dict(a)


async def delete_area(session_factory: Any, actor: str, area_id: str) -> dict:
    async with session_factory() as db:
        a = await get_or_error(db, Area, area_id, f"Area '{area_id}' not found.")
        await db.delete(a)
        await write_audit_entry(
            db,
            actor=actor,
            action="area_deleted",
            resource_type="area",
            resource_id=area_id,
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": area_id}
