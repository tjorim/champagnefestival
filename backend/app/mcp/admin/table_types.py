"""Admin (write) MCP tool implementations for table type management.

Mirrors ``app.routers.table_types``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.audit import write_audit_entry
from app.mcp.utils import get_or_error, validate_with_schema
from app.models import Table, TableType
from app.schemas import TableTypeCreate, TableTypeUpdate
from app.utils import make_id, table_type_to_dict


async def create_table_type(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    shape: str = "rectangle",
    width_m: float = 0.7,
    length_m: float = 1.8,
    height_type: str = "low",
    max_capacity: int,
    active: bool = True,
) -> dict:
    # TableTypeCreate.normalise_dimensions (a model_validator) forces
    # length_m == width_m for round tables and swaps them if length_m <
    # width_m for rectangular ones — running it here (rather than passing raw
    # kwargs to the ORM row below) keeps that behaviour identical to REST.
    body = validate_with_schema(
        TableTypeCreate,
        name=name,
        shape=shape,
        width_m=width_m,
        length_m=length_m,
        height_type=height_type,
        max_capacity=max_capacity,
        active=active,
    )
    async with session_factory() as db:
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
            details={"name": tt.name, "shape": tt.shape},
        )
        await db.commit()
        await db.refresh(tt)
        return table_type_to_dict(tt)


async def list_table_types(session_factory: Any) -> dict:
    async with session_factory() as db:
        result = await db.execute(select(TableType).order_by(TableType.created_at))
        return {"table_types": [table_type_to_dict(tt) for tt in result.scalars().all()]}


async def get_table_type(session_factory: Any, type_id: str) -> dict:
    async with session_factory() as db:
        tt = await get_or_error(db, TableType, type_id, f"Table type '{type_id}' not found.")
        return table_type_to_dict(tt)


async def update_table_type(
    session_factory: Any,
    actor: str,
    type_id: str,
    *,
    name: str | None = None,
    shape: str | None = None,
    width_m: float | None = None,
    length_m: float | None = None,
    height_type: str | None = None,
    max_capacity: int | None = None,
    active: bool | None = None,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "name": name,
            "shape": shape,
            "width_m": width_m,
            "length_m": length_m,
            "height_type": height_type,
            "max_capacity": max_capacity,
            "active": active,
        }.items()
        if v is not None
    }
    body = validate_with_schema(TableTypeUpdate, **provided)
    async with session_factory() as db:
        tt = await get_or_error(db, TableType, type_id, f"Table type '{type_id}' not found.")
        if body.name is not None:
            tt.name = body.name
        if body.shape is not None:
            tt.shape = body.shape
        if body.width_m is not None:
            tt.width_m = body.width_m
        if body.length_m is not None:
            tt.length_m = body.length_m
        # TableTypeUpdate has no model_validator (unlike TableTypeCreate), so the
        # router re-derives the same dimension normalisation by hand after
        # applying fields; replicate that here rather than relying on the schema.
        if body.shape is not None or body.width_m is not None or body.length_m is not None:
            if tt.shape == "round":
                tt.length_m = tt.width_m
            elif tt.length_m < tt.width_m:
                tt.length_m, tt.width_m = tt.width_m, tt.length_m
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
            details={"fields_changed": sorted(body.model_fields_set)},
        )
        await db.commit()
        await db.refresh(tt)
        return table_type_to_dict(tt)


async def delete_table_type(session_factory: Any, actor: str, type_id: str) -> dict:
    async with session_factory() as db:
        tt = await get_or_error(db, TableType, type_id, f"Table type '{type_id}' not found.")
        in_use = await db.execute(select(Table).where(Table.table_type_id == type_id).limit(1))
        if in_use.scalars().first() is not None:
            raise ValueError("Cannot delete: tables are still using this type.")
        await db.delete(tt)
        await write_audit_entry(
            db,
            actor=actor,
            action="table_type_deleted",
            resource_type="table_type",
            resource_id=type_id,
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": type_id}
