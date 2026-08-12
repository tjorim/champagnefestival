"""Shared application-service operations for floor-plan areas.

Used by both ``app.routers.areas`` (REST) and ``app.mcp.admin.areas`` (MCP).
See ``app/services/layouts_service.py`` for the pattern this follows and
``app/services/errors.py`` for the exception convention each adapter
translates at its own boundary.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Area, Exhibitor, Layout
from app.schemas import AreaCreate, AreaUpdate
from app.services.errors import NotFoundError, ValidationFailedError
from app.utils import area_to_dict, make_id


async def _check_exhibitor_assignable(db: AsyncSession, exhibitor_id: int) -> None:
    ex = await db.execute(select(Exhibitor).where(Exhibitor.id == exhibitor_id))
    exhibitor = ex.scalar_one_or_none()
    if exhibitor is None:
        raise NotFoundError(f"Exhibitor '{exhibitor_id}' not found.")
    if not exhibitor.active:
        raise ValidationFailedError(f"Exhibitor '{exhibitor_id}' is inactive.")


async def create_area(db: AsyncSession, *, actor: str, body: AreaCreate, request_id: str | None = None) -> dict:
    lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
    if lay.scalar_one_or_none() is None:
        raise NotFoundError(f"Layout '{body.layout_id}' not found.")

    if body.exhibitor_id is not None:
        await _check_exhibitor_assignable(db, body.exhibitor_id)

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
        request_id=request_id,
        details={"label": a.label, "layout_id": a.layout_id},
    )
    await db.commit()
    await db.refresh(a)
    return area_to_dict(a)


async def list_areas(db: AsyncSession, layout_id: str | None = None) -> list[dict]:
    stmt = select(Area).order_by(Area.created_at, Area.id)
    if layout_id:
        stmt = stmt.where(Area.layout_id == layout_id)
    result = await db.execute(stmt)
    return [area_to_dict(a) for a in result.scalars().all()]


async def get_area(db: AsyncSession, area_id: str) -> dict:
    a = await db.get(Area, area_id)
    if a is None:
        raise NotFoundError(f"Area '{area_id}' not found.")
    return area_to_dict(a)


async def update_area(
    db: AsyncSession,
    *,
    actor: str,
    area_id: str,
    body: AreaUpdate,
    request_id: str | None = None,
) -> dict:
    a = await db.get(Area, area_id)
    if a is None:
        raise NotFoundError(f"Area '{area_id}' not found.")

    fields_changed: list[str] = []
    if body.label is not None:
        a.label = body.label
        fields_changed.append("label")
    if body.icon is not None:
        a.icon = body.icon
        fields_changed.append("icon")
    if body.x is not None:
        a.x = body.x
        fields_changed.append("x")
    if body.y is not None:
        a.y = body.y
        fields_changed.append("y")
    if body.width_m is not None:
        a.width_m = body.width_m
        fields_changed.append("width_m")
    if body.length_m is not None:
        a.length_m = body.length_m
        fields_changed.append("length_m")
    if body.rotation is not None:
        a.rotation = body.rotation
        fields_changed.append("rotation")
    if "exhibitor_id" in body.model_fields_set:
        if body.exhibitor_id is not None:
            await _check_exhibitor_assignable(db, body.exhibitor_id)
        a.exhibitor_id = body.exhibitor_id
        fields_changed.append("exhibitor_id")

    await write_audit_entry(
        db,
        actor=actor,
        action="area_updated",
        resource_type="area",
        resource_id=a.id,
        request_id=request_id,
        details={"fields_changed": sorted(fields_changed)},
    )
    await db.commit()
    await db.refresh(a)
    return area_to_dict(a)


async def delete_area(db: AsyncSession, *, actor: str, area_id: str, request_id: str | None = None) -> dict:
    a = await db.get(Area, area_id)
    if a is None:
        raise NotFoundError(f"Area '{area_id}' not found.")
    await db.delete(a)
    await write_audit_entry(
        db,
        actor=actor,
        action="area_deleted",
        resource_type="area",
        resource_id=area_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "id": area_id}
