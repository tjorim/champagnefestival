"""Area management endpoints (admin only)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Area, Layout
from app.schemas import AreaCreate, AreaOut, AreaUpdate
from app.utils import area_to_dict, make_id

router = APIRouter(
    prefix="/api/areas",
    tags=["areas"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=AreaOut, status_code=status.HTTP_201_CREATED)
async def create_area(body: AreaCreate, db: AsyncSession = Depends(get_db)) -> dict:
    lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
    if lay.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail=f"Layout '{body.layout_id}' not found.")

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
    return area_to_dict(await _get_or_404(db, area_id))


@router.put("/{area_id}", response_model=AreaOut)
async def update_area(
    area_id: str,
    body: AreaUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    a = await _get_or_404(db, area_id)

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
    if "rotation" in body.model_fields_set and body.rotation is not None:
        a.rotation = body.rotation
    if "exhibitor_id" in body.model_fields_set:
        a.exhibitor_id = body.exhibitor_id

    await db.commit()
    await db.refresh(a)
    return area_to_dict(a)


@router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_area(area_id: str, db: AsyncSession = Depends(get_db)) -> None:
    a = await _get_or_404(db, area_id)
    await db.delete(a)
    await db.commit()


async def _get_or_404(db: AsyncSession, area_id: str) -> Area:
    result = await db.execute(select(Area).where(Area.id == area_id))
    a = result.scalar_one_or_none()
    if a is None:
        raise HTTPException(status_code=404, detail="Area not found.")
    return a
