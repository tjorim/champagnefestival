"""Admin (write) MCP tool implementations for table management.

Mirrors ``app.routers.tables``.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.live import live_bus
from app.live import mapping as live_mapping
from app.mcp.utils import get_or_error, validate_with_schema
from app.models import Layout, Registration, Table, TableType
from app.schemas import TableCreate, TableUpdate
from app.utils import make_id, table_to_dict

logger = logging.getLogger(__name__)


async def _get_layout_edition_id(db: AsyncSession, layout_id: str) -> str | None:
    result = await db.execute(select(Layout.edition_id).where(Layout.id == layout_id))
    return result.scalar_one_or_none()


async def create_table(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    capacity: int,
    table_type_id: str,
    layout_id: str,
    x: float = 50.0,
    y: float = 50.0,
    rotation: int = 0,
) -> dict:
    body = validate_with_schema(
        TableCreate,
        name=name,
        capacity=capacity,
        x=x,
        y=y,
        table_type_id=table_type_id,
        rotation=rotation,
        layout_id=layout_id,
    )
    async with session_factory() as db:
        tt = await db.execute(select(TableType).where(TableType.id == body.table_type_id))
        if tt.scalar_one_or_none() is None:
            raise ValueError(f"TableType '{body.table_type_id}' not found.")
        lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
        if lay.scalar_one_or_none() is None:
            raise ValueError(f"Layout '{body.layout_id}' not found.")

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
            details={"layout_id": t.layout_id, "name": t.name},
        )
        await db.commit()
        await db.refresh(t)
        edition_id = await _get_layout_edition_id(db, t.layout_id)
        try:
            await live_bus.publish(live_mapping.seating_changed(action="created", table_id=t.id, edition_id=edition_id))
        except Exception:
            logger.warning("live_bus.publish failed for table %s", t.id, exc_info=True)
        # New tables have no reservations yet
        return table_to_dict(t, [])


async def list_tables(session_factory: Any) -> dict:
    async with session_factory() as db:
        result = await db.execute(select(Table).order_by(Table.created_at))
        tables = result.scalars().all()

        res_result = await db.execute(
            select(Registration.id, Registration.table_id).where(Registration.table_id.isnot(None))
        )
        table_res_map: dict[str, list[str]] = {}
        for res_id, tbl_id in res_result.all():
            table_res_map.setdefault(tbl_id, []).append(res_id)

        return {"tables": [table_to_dict(t, table_res_map.get(t.id, [])) for t in tables]}


async def get_table(session_factory: Any, table_id: str) -> dict:
    async with session_factory() as db:
        t = await get_or_error(db, Table, table_id, f"Table '{table_id}' not found.")
        res_result = await db.execute(select(Registration.id).where(Registration.table_id == table_id))
        registration_ids = [row[0] for row in res_result.all()]
        return table_to_dict(t, registration_ids)


async def update_table(
    session_factory: Any,
    actor: str,
    table_id: str,
    *,
    name: str | None = None,
    capacity: int | None = None,
    x: float | None = None,
    y: float | None = None,
    table_type_id: str | None = None,
    rotation: int | None = None,
    layout_id: str | None = None,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "name": name,
            "capacity": capacity,
            "x": x,
            "y": y,
            "table_type_id": table_type_id,
            "rotation": rotation,
            "layout_id": layout_id,
        }.items()
        if v is not None
    }
    body = validate_with_schema(TableUpdate, **provided)
    async with session_factory() as db:
        t = await get_or_error(db, Table, table_id, f"Table '{table_id}' not found.")

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
                raise ValueError(f"TableType '{body.table_type_id}' not found.")
            t.table_type_id = body.table_type_id
        if "rotation" in body.model_fields_set and body.rotation is not None:
            t.rotation = body.rotation
        if "layout_id" in body.model_fields_set and body.layout_id is not None:
            lay = await db.execute(select(Layout).where(Layout.id == body.layout_id))
            if lay.scalar_one_or_none() is None:
                raise ValueError(f"Layout '{body.layout_id}' not found.")
            t.layout_id = body.layout_id

        await write_audit_entry(
            db,
            actor=actor,
            action="table_updated",
            resource_type="table",
            resource_id=table_id,
            details={"fields": list(body.model_fields_set)},
        )
        await db.commit()
        await db.refresh(t)
        edition_id = await _get_layout_edition_id(db, t.layout_id)
        try:
            await live_bus.publish(
                live_mapping.seating_changed(action="updated", table_id=table_id, edition_id=edition_id)
            )
        except Exception:
            logger.warning("live_bus.publish failed for table %s", table_id, exc_info=True)
        res_result = await db.execute(select(Registration.id).where(Registration.table_id == table_id))
        registration_ids = [row[0] for row in res_result.all()]
        return table_to_dict(t, registration_ids)


async def delete_table(session_factory: Any, actor: str, table_id: str) -> dict:
    async with session_factory() as db:
        t = await get_or_error(db, Table, table_id, f"Table '{table_id}' not found.")
        edition_id = await _get_layout_edition_id(db, t.layout_id)
        await write_audit_entry(
            db,
            actor=actor,
            action="table_deleted",
            resource_type="table",
            resource_id=table_id,
            details={"layout_id": t.layout_id, "name": t.name},
        )
        await db.delete(t)
        await db.commit()
        try:
            await live_bus.publish(
                live_mapping.seating_changed(action="deleted", table_id=table_id, edition_id=edition_id)
            )
        except Exception:
            logger.warning("live_bus.publish failed for deleted table %s", table_id, exc_info=True)
        return {"deleted": True, "id": table_id}
