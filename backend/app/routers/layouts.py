"""Layout snapshot management endpoints (admin only)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Layout, Table
from app.schemas import LayoutCreate, LayoutOut
from app.utils import layout_to_dict, make_id

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
    existing_stmt = select(Layout).where(
        Layout.room_id == body.room_id,
        Layout.day_id == body.day_id,
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
        day_id=body.day_id,
        label=body.label.strip(),
    )
    db.add(lay)
    await db.commit()
    await db.refresh(lay)
    return layout_to_dict(lay)


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
    return [layout_to_dict(lay) for lay in result.scalars().all()]


# ---------------------------------------------------------------------------
# Get single layout
# ---------------------------------------------------------------------------


@router.get("/{layout_id}", response_model=LayoutOut)
async def get_layout(layout_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return layout_to_dict(await _get_or_404(db, layout_id))


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
