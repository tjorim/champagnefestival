"""Table management endpoints (admin only)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Table
from app.schemas import TableCreate, TableOut, TableUpdate
from app.utils import make_id, table_to_dict

router = APIRouter(
    prefix="/api/tables",
    tags=["tables"],
    dependencies=[Depends(require_admin)],
)


# ---------------------------------------------------------------------------
# Create table
# ---------------------------------------------------------------------------


@router.post("", response_model=TableOut, status_code=status.HTTP_201_CREATED)
async def create_table(
    body: TableCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    t = Table(
        id=make_id("tbl"),
        name=body.name,
        capacity=body.capacity,
        x=body.x,
        y=body.y,
        room_id=body.room_id,
    )
    t.set_reservation_ids([])
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return table_to_dict(t)


# ---------------------------------------------------------------------------
# List tables
# ---------------------------------------------------------------------------


@router.get("", response_model=list[TableOut])
async def list_tables(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Table).order_by(Table.created_at))
    return [table_to_dict(t) for t in result.scalars().all()]


# ---------------------------------------------------------------------------
# Get single table
# ---------------------------------------------------------------------------


@router.get("/{table_id}", response_model=TableOut)
async def get_table(table_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return table_to_dict(await _get_or_404(db, table_id))


# ---------------------------------------------------------------------------
# Update table
# ---------------------------------------------------------------------------


@router.put("/{table_id}", response_model=TableOut)
async def update_table(
    table_id: str,
    body: TableUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    t = await _get_or_404(db, table_id)

    if body.name is not None:
        t.name = body.name
    if body.capacity is not None:
        t.capacity = body.capacity
    if body.x is not None:
        t.x = body.x
    if body.y is not None:
        t.y = body.y
    if "room_id" in body.model_fields_set:
        t.room_id = body.room_id
    if body.reservation_ids is not None:
        t.set_reservation_ids(body.reservation_ids)

    await db.commit()
    await db.refresh(t)
    return table_to_dict(t)


# ---------------------------------------------------------------------------
# Delete table
# ---------------------------------------------------------------------------


@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_table(table_id: str, db: AsyncSession = Depends(get_db)) -> None:
    t = await _get_or_404(db, table_id)
    await db.delete(t)
    await db.commit()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def _get_or_404(db: AsyncSession, table_id: str) -> Table:
    result = await db.execute(select(Table).where(Table.id == table_id))
    t = result.scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="Table not found.")
    return t
