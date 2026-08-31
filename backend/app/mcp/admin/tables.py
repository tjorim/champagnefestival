"""Admin (write) MCP tool implementations for table management.

Mirrors ``app.routers.tables``. Business logic lives in
``app.services.tables_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import TableBulkCreate, TableCreate, TableUpdate
from app.services import tables_service
from app.services.errors import ServiceError


async def create_table(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    table_type_id: str,
    layout_id: str,
    x: float = 50.0,
    y: float = 50.0,
    rotation: int = 0,
) -> dict:
    body = validate_with_schema(
        TableCreate,
        name=name,
        x=x,
        y=y,
        table_type_id=table_type_id,
        rotation=rotation,
        layout_id=layout_id,
    )
    async with session_factory() as db:
        try:
            return await tables_service.create_table(db, actor=actor, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def bulk_create_tables(
    session_factory: Any,
    actor: str,
    *,
    items: list[TableCreate],
    idempotency_key: str | None = None,
) -> dict:
    validate_with_schema(TableBulkCreate, items=items, idempotency_key=idempotency_key)
    async with session_factory() as db:
        try:
            return await tables_service.bulk_create_tables(
                db, actor=actor, items=items, idempotency_key=idempotency_key
            )
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def list_tables(session_factory: Any, layout_id: str | None = None) -> dict:
    async with session_factory() as db:
        return {"tables": await tables_service.list_tables(db, layout_id)}


async def get_table(session_factory: Any, table_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await tables_service.get_table(db, table_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def update_table(
    session_factory: Any,
    actor: str,
    table_id: str,
    *,
    name: str | None = None,
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
        try:
            return await tables_service.update_table(db, actor=actor, table_id=table_id, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_table(session_factory: Any, actor: str, table_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await tables_service.delete_table(db, actor=actor, table_id=table_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
