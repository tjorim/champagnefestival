"""Table type management endpoints (admin only)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Table, TableType
from app.schemas import TableTypeCreate, TableTypeOut, TableTypeUpdate
from app.utils import make_id, table_type_to_dict

router = APIRouter(
    prefix="/api/table-types",
    tags=["table-types"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=TableTypeOut, status_code=status.HTTP_201_CREATED)
async def create_table_type(
    body: TableTypeCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    tt = TableType(
        id=make_id("ttype"),
        name=body.name,
        shape=body.shape,
        width_m=body.width_m,
        length_m=body.length_m,
        height_type=body.height_type,
        max_capacity=body.max_capacity,
    )
    db.add(tt)
    await db.commit()
    await db.refresh(tt)
    return table_type_to_dict(tt)


@router.get("", response_model=list[TableTypeOut])
async def list_table_types(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(TableType).order_by(TableType.created_at))
    return [table_type_to_dict(tt) for tt in result.scalars().all()]


@router.get("/{type_id}", response_model=TableTypeOut)
async def get_table_type(type_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return table_type_to_dict(await _get_or_404(db, type_id))


@router.put("/{type_id}", response_model=TableTypeOut)
async def update_table_type(
    type_id: str,
    body: TableTypeUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    tt = await _get_or_404(db, type_id)
    if body.name is not None:
        tt.name = body.name
    if body.shape is not None:
        tt.shape = body.shape
    if body.width_m is not None:
        tt.width_m = body.width_m
    if body.length_m is not None:
        tt.length_m = body.length_m
    if tt.shape == "round":
        tt.length_m = tt.width_m
    elif tt.length_m < tt.width_m:
        tt.length_m, tt.width_m = tt.width_m, tt.length_m
    if body.height_type is not None:
        tt.height_type = body.height_type
    if body.max_capacity is not None:
        tt.max_capacity = body.max_capacity
    await db.commit()
    await db.refresh(tt)
    return table_type_to_dict(tt)


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_table_type(type_id: str, db: AsyncSession = Depends(get_db)) -> None:
    tt = await _get_or_404(db, type_id)
    in_use = await db.execute(select(Table).where(Table.table_type_id == type_id).limit(1))
    if in_use.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete: tables are still using this type.",
        )
    await db.delete(tt)
    await db.commit()


async def _get_or_404(db: AsyncSession, type_id: str) -> TableType:
    result = await db.execute(select(TableType).where(TableType.id == type_id))
    tt = result.scalar_one_or_none()
    if tt is None:
        raise HTTPException(status_code=404, detail="Table type not found.")
    return tt
