"""Admin (write) MCP tool implementations for table type management.

Mirrors ``app.routers.table_types``. Business logic lives in
``app.services.table_types_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import validate_with_schema
from app.schemas import TableTypeCreate, TableTypeUpdate
from app.services import table_types_service
from app.services.errors import ServiceError


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
        try:
            return await table_types_service.create_table_type(db, actor=actor, body=body)
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc


async def list_table_types(session_factory: Any) -> dict:
    async with session_factory() as db:
        return {"table_types": await table_types_service.list_table_types(db)}


async def get_table_type(session_factory: Any, type_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await table_types_service.get_table_type(db, type_id)
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc


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
        try:
            return await table_types_service.update_table_type(db, actor=actor, type_id=type_id, body=body)
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc


async def delete_table_type(session_factory: Any, actor: str, type_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await table_types_service.delete_table_type(db, actor=actor, type_id=type_id)
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc
