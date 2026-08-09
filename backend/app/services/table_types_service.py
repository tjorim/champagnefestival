"""Shared application-service operations for table types.

Used by both ``app.routers.table_types`` (REST) and
``app.mcp.admin.table_types`` (MCP). See ``app/services/layouts_service.py``
for the pattern this follows and ``app/services/errors.py`` for the
exception convention each adapter translates at its own boundary.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Table, TableType
from app.schemas import TableTypeCreate, TableTypeUpdate
from app.services.errors import ConflictError, NotFoundError
from app.utils import make_id, table_type_to_dict


async def create_table_type(
    db: AsyncSession, *, actor: str, body: TableTypeCreate, request_id: str | None = None
) -> dict:
    # TableTypeCreate.normalise_dimensions (a model_validator) forces
    # length_m == width_m for round tables and swaps them if length_m <
    # width_m for rectangular ones — it already ran on `body` at the REST/MCP
    # boundary, so this row copies its normalised values as-is.
    tt = TableType(
        id=make_id("ttype"),
        name=body.name,
        shape=body.shape,
        width_m=body.width_m,
        length_m=body.length_m,
        height_type=body.height_type,
        max_capacity=body.max_capacity,
        active=body.active,
    )
    db.add(tt)
    await write_audit_entry(
        db,
        actor=actor,
        action="table_type_created",
        resource_type="table_type",
        resource_id=tt.id,
        request_id=request_id,
        details={"name": tt.name, "shape": tt.shape},
    )
    await db.commit()
    await db.refresh(tt)
    return table_type_to_dict(tt)


async def list_table_types(db: AsyncSession, *, limit: int | None = None, offset: int = 0) -> list[dict]:
    stmt = select(TableType).order_by(TableType.created_at, TableType.id).offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return [table_type_to_dict(tt) for tt in result.scalars().all()]


async def get_table_type(db: AsyncSession, type_id: str) -> dict:
    tt = await db.get(TableType, type_id)
    if tt is None:
        raise NotFoundError(f"Table type '{type_id}' not found.")
    return table_type_to_dict(tt)


async def update_table_type(
    db: AsyncSession, *, actor: str, type_id: str, body: TableTypeUpdate, request_id: str | None = None
) -> dict:
    tt = await db.get(TableType, type_id)
    if tt is None:
        raise NotFoundError(f"Table type '{type_id}' not found.")
    if body.name is not None:
        tt.name = body.name
    if body.shape is not None:
        tt.shape = body.shape
    if body.width_m is not None:
        tt.width_m = body.width_m
    if body.length_m is not None:
        tt.length_m = body.length_m
    if body.shape is not None or body.width_m is not None or body.length_m is not None:
        from app.utils import normalise_table_type_dimensions

        tt.width_m, tt.length_m = normalise_table_type_dimensions(tt.shape, tt.width_m, tt.length_m)
    if body.height_type is not None:
        tt.height_type = body.height_type
    if body.max_capacity is not None:
        tt.max_capacity = body.max_capacity
    if body.active is not None:
        tt.active = body.active
    await write_audit_entry(
        db,
        actor=actor,
        action="table_type_updated",
        resource_type="table_type",
        resource_id=tt.id,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(tt)
    return table_type_to_dict(tt)


async def delete_table_type(db: AsyncSession, *, actor: str, type_id: str, request_id: str | None = None) -> dict:
    tt = await db.get(TableType, type_id)
    if tt is None:
        raise NotFoundError(f"Table type '{type_id}' not found.")
    # Lock the table type row so a concurrent table creation (which validates the
    # type exists before inserting) can't race this delete: whichever transaction
    # locks the type first is the one the other serializes behind.
    await db.execute(select(TableType.id).where(TableType.id == type_id).with_for_update())
    in_use = await db.execute(select(Table).where(Table.table_type_id == type_id).limit(1))
    if in_use.scalars().first() is not None:
        raise ConflictError("Cannot delete: tables are still using this type.")
    await db.delete(tt)
    await write_audit_entry(
        db,
        actor=actor,
        action="table_type_deleted",
        resource_type="table_type",
        resource_id=type_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "id": type_id}
