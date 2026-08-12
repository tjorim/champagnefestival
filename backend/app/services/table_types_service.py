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
from app.models import Layout, Table, TableType, Venue
from app.schemas import TableTypeCreate, TableTypeUpdate
from app.services.errors import ConflictError, NotFoundError
from app.utils import make_id, table_type_to_dict


async def create_table_type(
    db: AsyncSession, *, actor: str, body: TableTypeCreate, request_id: str | None = None
) -> dict:
    venue = await db.execute(select(Venue).where(Venue.id == body.venue_id))
    if venue.scalar_one_or_none() is None:
        raise NotFoundError(f"Venue '{body.venue_id}' not found.")

    # TableTypeCreate.normalise_dimensions (a model_validator) forces
    # length_m == width_m for round tables and swaps them if length_m <
    # width_m for rectangular ones — it already ran on `body` at the REST/MCP
    # boundary, so this row copies its normalised values as-is.
    tt = TableType(
        id=make_id("ttype"),
        name=body.name,
        venue_id=body.venue_id,
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
        details={"name": tt.name, "shape": tt.shape, "venue_id": tt.venue_id},
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
    fields_changed: list[str] = []
    pre_width, pre_length = tt.width_m, tt.length_m
    if body.name is not None:
        tt.name = body.name
        fields_changed.append("name")
    if body.venue_id is not None:
        venue = await db.execute(select(Venue).where(Venue.id == body.venue_id))
        if venue.scalar_one_or_none() is None:
            raise NotFoundError(f"Venue '{body.venue_id}' not found.")
        tt.venue_id = body.venue_id
        fields_changed.append("venue_id")
    if body.shape is not None:
        tt.shape = body.shape
        fields_changed.append("shape")
    if body.width_m is not None:
        tt.width_m = body.width_m
        fields_changed.append("width_m")
    if body.length_m is not None:
        tt.length_m = body.length_m
        fields_changed.append("length_m")
    reshape_requested = body.shape is not None or body.width_m is not None or body.length_m is not None
    blast_radius: dict[str, int] = {}
    if reshape_requested:
        from app.utils import normalise_table_type_dimensions

        tt.width_m, tt.length_m = normalise_table_type_dimensions(tt.shape, tt.width_m, tt.length_m)
        if tt.width_m != pre_width and "width_m" not in fields_changed:
            fields_changed.append("width_m")
        if tt.length_m != pre_length and "length_m" not in fields_changed:
            fields_changed.append("length_m")
        # A shape/dimension change re-renders every table of this type on every
        # layout that ever placed one — including past editions, since tables
        # render by joining live against TableType rather than a snapshot taken
        # at placement time (#858). No confirmation gate here (that lives in the
        # admin UI, which has this count ahead of the save); this is the audit
        # trail's record of the blast radius for whichever change went through.
        affected = await db.execute(
            select(Table.id, Layout.room_id)
            .join(Layout, Table.layout_id == Layout.id)
            .where(Table.table_type_id == type_id)
        )
        rows = affected.all()
        blast_radius = {"affected_tables": len(rows), "affected_rooms": len({room_id for _, room_id in rows})}
    if body.height_type is not None:
        tt.height_type = body.height_type
        fields_changed.append("height_type")
    if body.max_capacity is not None:
        tt.max_capacity = body.max_capacity
        fields_changed.append("max_capacity")
    if body.active is not None:
        tt.active = body.active
        fields_changed.append("active")
    await write_audit_entry(
        db,
        actor=actor,
        action="table_type_updated",
        resource_type="table_type",
        resource_id=tt.id,
        request_id=request_id,
        details={"fields_changed": sorted(fields_changed), **blast_radius},
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
