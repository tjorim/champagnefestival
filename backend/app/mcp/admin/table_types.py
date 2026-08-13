"""Admin (write) MCP tool implementations for table type management.

Mirrors ``app.routers.table_types``. Business logic lives in
``app.services.table_types_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any, Literal

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import TableTypeCreate, TableTypeUpdate
from app.services import table_types_service
from app.services.errors import ServiceError


async def create_table_type(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    venue_id: str,
    width_m: float,
    length_m: float,
    shape: Literal["rectangle", "round"] = "rectangle",
    height_type: Literal["low", "high"] = "low",
    max_capacity: int,
    active: bool = True,
) -> dict:
    body = validate_with_schema(
        TableTypeCreate,
        name=name,
        venue_id=venue_id,
        shape=shape,
        width_m=width_m,
        length_m=length_m,
        height_type=height_type,
        max_capacity=max_capacity,
        active=active,
    )
    async with session_factory() as db:
        try:
            return await table_types_service.create_table_type(db, actor=actor, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def bulk_create_table_types(
    session_factory: Any,
    actor: str,
    *,
    items: list[TableTypeCreate],
    idempotency_key: str | None = None,
) -> dict:
    async with session_factory() as db:
        try:
            return await table_types_service.bulk_create_table_types(
                db, actor=actor, items=items, idempotency_key=idempotency_key
            )
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def list_table_types(session_factory: Any) -> dict:
    async with session_factory() as db:
        return {"table_types": await table_types_service.list_table_types(db)}


async def get_table_type(session_factory: Any, type_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await table_types_service.get_table_type(db, type_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def update_table_type(
    session_factory: Any,
    actor: str,
    type_id: str,
    *,
    name: str | None = None,
    venue_id: str | None = None,
    shape: Literal["rectangle", "round"] | None = None,
    width_m: float | None = None,
    length_m: float | None = None,
    height_type: Literal["low", "high"] | None = None,
    max_capacity: int | None = None,
    active: bool | None = None,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "name": name,
            "venue_id": venue_id,
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
        try:
            return await table_types_service.update_table_type(db, actor=actor, type_id=type_id, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_table_type(session_factory: Any, actor: str, type_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await table_types_service.delete_table_type(db, actor=actor, type_id=type_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
