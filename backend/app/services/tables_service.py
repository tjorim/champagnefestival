"""Shared application-service operations for floor-plan tables.

Used by both ``app.routers.tables`` (REST) and ``app.mcp.admin.tables`` (MCP).
See ``app/services/layouts_service.py`` for the pattern this follows and
``app/services/errors.py`` for the exception convention each adapter
translates at its own boundary.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.live import live_bus
from app.live import mapping as live_mapping
from app.models import Layout, Registration, Table, TableType
from app.schemas import TableCreate, TableUpdate
from app.services.errors import ConflictError, NotFoundError
from app.utils import make_id, table_to_dict

logger = logging.getLogger(__name__)


async def _get_layout_edition_id(db: AsyncSession, layout_id: str) -> str | None:
    result = await db.execute(select(Layout.edition_id).where(Layout.id == layout_id))
    return result.scalar_one_or_none()


async def _publish_seating_changed(*, action: str, table_id: str, edition_id: str | None) -> None:
    try:
        await live_bus.publish(live_mapping.seating_changed(action=action, table_id=table_id, edition_id=edition_id))
    except Exception:
        logger.warning("live_bus.publish failed for table %s", table_id, exc_info=True)


async def create_table(db: AsyncSession, *, actor: str, body: TableCreate, request_id: str | None = None) -> dict:
    # Lock the referenced TableType row so a concurrent delete_table_type (which
    # acquires with_for_update on the same row) serializes correctly.
    tt = await db.execute(select(TableType).where(TableType.id == body.table_type_id).with_for_update())
    if tt.scalar_one_or_none() is None:
        raise NotFoundError(f"TableType '{body.table_type_id}' not found.")
    lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
    if lay.scalar_one_or_none() is None:
        raise NotFoundError(f"Layout '{body.layout_id}' not found.")

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
    await write_audit_entry(
        db,
        actor=actor,
        action="table_created",
        resource_type="table",
        resource_id=t.id,
        request_id=request_id,
        details={"layout_id": t.layout_id, "name": t.name},
    )
    await db.commit()
    await db.refresh(t)
    edition_id = await _get_layout_edition_id(db, t.layout_id)
    await _publish_seating_changed(action="created", table_id=t.id, edition_id=edition_id)
    # New tables have no reservations yet
    return table_to_dict(t, [])


async def list_tables(db: AsyncSession, layout_id: str | None = None) -> list[dict]:
    stmt = select(Table).order_by(Table.created_at, Table.id)
    if layout_id:
        stmt = stmt.where(Table.layout_id == layout_id)
    result = await db.execute(stmt)
    tables = result.scalars().all()

    # Compute registration_ids from the Registration.table_id FK (source of truth),
    # scoped to the tables actually being returned.
    table_res_map: dict[str, list[str]] = {}
    table_ids = [t.id for t in tables]
    if table_ids:
        res_result = await db.execute(
            select(Registration.id, Registration.table_id).where(Registration.table_id.in_(table_ids))
        )
        for res_id, tbl_id in res_result.all():
            table_res_map.setdefault(tbl_id, []).append(res_id)

    return [table_to_dict(t, table_res_map.get(t.id, [])) for t in tables]


async def get_table(db: AsyncSession, table_id: str) -> dict:
    t = await db.get(Table, table_id)
    if t is None:
        raise NotFoundError(f"Table '{table_id}' not found.")
    res_result = await db.execute(select(Registration.id).where(Registration.table_id == table_id))
    registration_ids = [row[0] for row in res_result.all()]
    return table_to_dict(t, registration_ids)


async def update_table(
    db: AsyncSession,
    *,
    actor: str,
    table_id: str,
    body: TableUpdate,
    request_id: str | None = None,
) -> dict:
    t = await db.get(Table, table_id)
    if t is None:
        raise NotFoundError(f"Table '{table_id}' not found.")

    # All fields in TableUpdate are Optional[…], so an absent key and an
    # explicit null both arrive here as None and are simply skipped.  Only
    # fields with a real value are applied to the row.
    fields_changed: list[str] = []
    if body.name is not None:
        t.name = body.name
        fields_changed.append("name")
    if body.capacity is not None:
        t.capacity = body.capacity
        fields_changed.append("capacity")
    if body.x is not None:
        t.x = body.x
        fields_changed.append("x")
    if body.y is not None:
        t.y = body.y
        fields_changed.append("y")
    if body.table_type_id is not None:
        tt = await db.execute(select(TableType).where(TableType.id == body.table_type_id))
        if tt.scalar_one_or_none() is None:
            raise NotFoundError(f"TableType '{body.table_type_id}' not found.")
        t.table_type_id = body.table_type_id
        fields_changed.append("table_type_id")
    if body.rotation is not None:
        t.rotation = body.rotation
        fields_changed.append("rotation")
    if body.layout_id is not None:
        lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
        if lay.scalar_one_or_none() is None:
            raise NotFoundError(f"Layout '{body.layout_id}' not found.")
        t.layout_id = body.layout_id
        fields_changed.append("layout_id")

    await write_audit_entry(
        db,
        actor=actor,
        action="table_updated",
        resource_type="table",
        resource_id=table_id,
        request_id=request_id,
        details={"fields_changed": sorted(fields_changed)},
    )
    await db.commit()
    await db.refresh(t)
    edition_id = await _get_layout_edition_id(db, t.layout_id)
    await _publish_seating_changed(action="updated", table_id=table_id, edition_id=edition_id)
    res_result = await db.execute(select(Registration.id).where(Registration.table_id == table_id))
    registration_ids = [row[0] for row in res_result.all()]
    return table_to_dict(t, registration_ids)


async def delete_table(db: AsyncSession, *, actor: str, table_id: str, request_id: str | None = None) -> dict:
    t = await db.get(Table, table_id)
    if t is None:
        raise NotFoundError(f"Table '{table_id}' not found.")
    regs = await db.execute(select(Registration.id).where(Registration.table_id == table_id).limit(1))
    if regs.scalars().first() is not None:
        raise ConflictError("Cannot delete: registrations are still assigned to this table.")
    edition_id = await _get_layout_edition_id(db, t.layout_id)
    await write_audit_entry(
        db,
        actor=actor,
        action="table_deleted",
        resource_type="table",
        resource_id=table_id,
        request_id=request_id,
        details={"layout_id": t.layout_id, "name": t.name},
    )
    await db.delete(t)
    await db.commit()
    await _publish_seating_changed(action="deleted", table_id=table_id, edition_id=edition_id)
    return {"deleted": True, "id": table_id}
