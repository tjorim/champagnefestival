"""Table management endpoints (admin only)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Layout, Registration, Table, TableType
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
    tt = await db.execute(select(TableType).where(TableType.id == body.table_type_id))
    if tt.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail=f"TableType '{body.table_type_id}' not found.")
    lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
    if lay.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail=f"Layout '{body.layout_id}' not found.")

    t = Table(
        id=make_id("tbl"),
        name=body.name,
        capacity=body.capacity,
        x=body.x,
        y=body.y,
        table_type_id=body.table_type_id,
        rotation=body.rotation,
        layout_id=body.layout_id,
    )
    t.reservation_ids = []
    db.add(t)
    await db.commit()
    await db.refresh(t)
    # New tables have no reservations yet
    return table_to_dict(t, [])


# ---------------------------------------------------------------------------
# List tables
# ---------------------------------------------------------------------------


@router.get("", response_model=list[TableOut])
async def list_tables(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Table).order_by(Table.created_at))
    tables = result.scalars().all()

    # Compute registration_ids from the Registration.table_id FK (source of truth)
    res_result = await db.execute(
        select(Registration.id, Registration.table_id).where(Registration.table_id.isnot(None))
    )
    table_res_map: dict[str, list[str]] = {}
    for res_id, tbl_id in res_result.all():
        table_res_map.setdefault(tbl_id, []).append(res_id)

    return [table_to_dict(t, table_res_map.get(t.id, [])) for t in tables]


# ---------------------------------------------------------------------------
# Get single table
# ---------------------------------------------------------------------------


@router.get("/{table_id}", response_model=TableOut)
async def get_table(table_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    t = await _get_or_404(db, table_id)
    res_result = await db.execute(select(Registration.id).where(Registration.table_id == table_id))
    registration_ids = [row[0] for row in res_result.all()]
    return table_to_dict(t, registration_ids)


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

    # All fields in TableUpdate are Optional[…], so an absent key and an
    # explicit null both arrive here as None and are simply skipped.  Only
    # fields with a real value are applied to the row.
    if body.name is not None:
        t.name = body.name
    if body.capacity is not None:
        t.capacity = body.capacity
    if body.x is not None:
        t.x = body.x
    if body.y is not None:
        t.y = body.y
    if body.table_type_id is not None:
        tt = await db.execute(select(TableType).where(TableType.id == body.table_type_id))
        if tt.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail=f"TableType '{body.table_type_id}' not found.")
        t.table_type_id = body.table_type_id
    # Zero-valid fields: must use model_fields_set so that an explicit zero
    # degrees (rotation=0) is honoured even though the value is falsy.
    if "rotation" in body.model_fields_set and body.rotation is not None:
        t.rotation = body.rotation
    if "layout_id" in body.model_fields_set and body.layout_id is not None:
        lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
        if lay.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail=f"Layout '{body.layout_id}' not found.")
        t.layout_id = body.layout_id
    await db.commit()
    await db.refresh(t)
    res_result = await db.execute(select(Registration.id).where(Registration.table_id == table_id))
    registration_ids = [row[0] for row in res_result.all()]
    return table_to_dict(t, registration_ids)


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
