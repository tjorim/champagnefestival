"""Area management endpoints (admin only)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import Area, Exhibitor, Layout
from app.schemas import AreaCreate, AreaOut, AreaUpdate
from app.utils import area_to_dict, get_or_404, make_id

router = APIRouter(
    prefix="/api/areas",
    tags=["areas"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=AreaOut, status_code=status.HTTP_201_CREATED)
async def create_area(
    body: AreaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
    if lay.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail=f"Layout '{body.layout_id}' not found.")

    if body.exhibitor_id is not None:
        ex = await db.execute(select(Exhibitor).where(Exhibitor.id == body.exhibitor_id))
        exhibitor = ex.scalar_one_or_none()
        if exhibitor is None:
            raise HTTPException(status_code=404, detail=f"Exhibitor '{body.exhibitor_id}' not found.")
        if not exhibitor.active:
            raise HTTPException(status_code=400, detail=f"Exhibitor '{body.exhibitor_id}' is inactive.")

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
        request_id=getattr(request.state, "request_id", None),
        details={"label": a.label, "layout_id": a.layout_id},
    )
    await db.commit()
    await db.refresh(a)
    return area_to_dict(a)


@router.get("", response_model=list[AreaOut])
async def list_areas(
    layout_id: str | None = Query(default=None, description="Filter by layout ID"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    stmt = select(Area).order_by(Area.created_at)
    if layout_id:
        stmt = stmt.where(Area.layout_id == layout_id)
    result = await db.execute(stmt)
    return [area_to_dict(a) for a in result.scalars().all()]


@router.get("/{area_id}", response_model=AreaOut)
async def get_area(area_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return area_to_dict(await get_or_404(db, Area, area_id, "Area not found."))


@router.put("/{area_id}", response_model=AreaOut)
async def update_area(
    area_id: str,
    body: AreaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    a = await get_or_404(db, Area, area_id, "Area not found.")

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
                raise HTTPException(status_code=404, detail="Exhibitor not found.")
            if not exhibitor.active:
                raise HTTPException(status_code=400, detail="Exhibitor is inactive.")
        a.exhibitor_id = body.exhibitor_id

    await write_audit_entry(
        db,
        actor=actor,
        action="area_updated",
        resource_type="area",
        resource_id=a.id,
        request_id=getattr(request.state, "request_id", None),
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(a)
    return area_to_dict(a)


@router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_area(
    area_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    a = await get_or_404(db, Area, area_id, "Area not found.")
    await db.delete(a)
    await write_audit_entry(
        db,
        actor=actor,
        action="area_deleted",
        resource_type="area",
        resource_id=area_id,
        request_id=getattr(request.state, "request_id", None),
        details={},
    )
    await db.commit()
