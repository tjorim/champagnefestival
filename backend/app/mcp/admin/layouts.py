"""Admin (write) MCP tool implementations for floor-plan layout management.

Mirrors ``app.routers.layouts``. Business logic lives in
``app.services.layouts_service`` and is shared with the REST router — this
module validates MCP-style keyword arguments into the same Pydantic schema
REST uses, then delegates and translates ``ServiceError`` into ``ValueError``.
"""

from __future__ import annotations

from datetime import date as dt_date
from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import LayoutBulkCreate, LayoutCopyCreate, LayoutCreate
from app.services import layouts_service
from app.services.errors import ServiceError


async def create_layout(
    session_factory: Any,
    actor: str,
    *,
    room_id: str,
    edition_id: str | None = None,
    day_id: int | None = None,
    date: dt_date | None = None,
    label: str = "",
) -> dict:
    body = validate_with_schema(
        LayoutCreate,
        room_id=room_id,
        edition_id=edition_id,
        day_id=day_id,
        date=date,
        label=label,
    )
    async with session_factory() as db:
        try:
            return await layouts_service.create_layout(db, actor=actor, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def copy_layout(
    session_factory: Any,
    actor: str,
    source_layout_id: str,
    *,
    room_id: str,
    edition_id: str | None = None,
    day_id: int | None = None,
    date: dt_date | None = None,
    label: str = "",
    copy_tables: bool = True,
    copy_areas: bool = True,
) -> dict:
    body = validate_with_schema(
        LayoutCopyCreate,
        room_id=room_id,
        edition_id=edition_id,
        day_id=day_id,
        date=date,
        label=label,
        copy_tables=copy_tables,
        copy_areas=copy_areas,
    )
    async with session_factory() as db:
        try:
            return await layouts_service.copy_layout(db, actor=actor, source_layout_id=source_layout_id, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def bulk_create_layouts(
    session_factory: Any,
    actor: str,
    *,
    items: list[LayoutCreate],
    idempotency_key: str | None = None,
) -> dict:
    validate_with_schema(LayoutBulkCreate, items=items, idempotency_key=idempotency_key)
    async with session_factory() as db:
        try:
            return await layouts_service.bulk_create_layouts(
                db, actor=actor, items=items, idempotency_key=idempotency_key
            )
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def list_layouts(
    session_factory: Any,
    edition_id: str | None = None,
    room_id: str | None = None,
) -> dict:
    async with session_factory() as db:
        return {"layouts": await layouts_service.list_layouts(db, edition_id=edition_id, room_id=room_id)}


async def get_layout(session_factory: Any, layout_id: str, include_tables: bool = False) -> dict:
    async with session_factory() as db:
        try:
            return await layouts_service.get_layout(db, layout_id, include_tables=include_tables)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_layout(session_factory: Any, actor: str, layout_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await layouts_service.delete_layout(db, actor=actor, layout_id=layout_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
