"""Admin (write) MCP tool implementations for floor-plan layout management.

Mirrors ``app.routers.layouts``. Business logic lives in
``app.services.layouts_service`` and is shared with the REST router — this
module validates MCP-style keyword arguments into the same Pydantic schema
REST uses, then delegates and translates ``ServiceError`` into ``ValueError``.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import LayoutBulkCreate, LayoutCopyCreate, LayoutCreate, LayoutRevisionSaveRequest
from app.services import layouts_service
from app.services.errors import ServiceError


async def create_layout(
    session_factory: Any,
    actor: str,
    *,
    room_id: str,
    event_id: str,
    label: str = "",
) -> dict:
    body = validate_with_schema(
        LayoutCreate,
        room_id=room_id,
        event_id=event_id,
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
    event_id: str,
    label: str = "",
    copy_tables: bool = True,
    copy_areas: bool = True,
) -> dict:
    body = validate_with_schema(
        LayoutCopyCreate,
        room_id=room_id,
        event_id=event_id,
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
    event_id: str | None = None,
) -> dict:
    async with session_factory() as db:
        return {
            "layouts": await layouts_service.list_layouts(db, edition_id=edition_id, room_id=room_id, event_id=event_id)
        }


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


async def save_layout_revision(
    session_factory: Any,
    actor: str,
    layout_id: str,
    *,
    label: str,
    change_note: str | None = None,
) -> dict:
    body = validate_with_schema(LayoutRevisionSaveRequest, label=label, change_note=change_note)
    async with session_factory() as db:
        try:
            return await layouts_service.save_layout_revision(db, actor=actor, layout_id=layout_id, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def list_layout_revisions(session_factory: Any, layout_id: str) -> dict:
    async with session_factory() as db:
        try:
            return {"revisions": await layouts_service.list_layout_revisions(db, layout_id)}
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def get_layout_revision(session_factory: Any, layout_id: str, revision_number: int) -> dict:
    async with session_factory() as db:
        try:
            return await layouts_service.get_layout_revision(db, layout_id, revision_number)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def compare_layout_revisions(session_factory: Any, layout_id: str, from_ref: str, to_ref: str) -> dict:
    async with session_factory() as db:
        try:
            return await layouts_service.compare_layout_revisions(db, layout_id, from_ref, to_ref)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def preview_layout_restore(session_factory: Any, layout_id: str, revision_number: int) -> dict:
    async with session_factory() as db:
        try:
            return await layouts_service.preview_layout_restore(db, layout_id, revision_number)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def restore_layout_revision(
    session_factory: Any,
    actor: str,
    layout_id: str,
    revision_number: int,
    *,
    resolve_allocations: bool = False,
) -> dict:
    async with session_factory() as db:
        try:
            return await layouts_service.restore_layout_revision(
                db,
                actor=actor,
                layout_id=layout_id,
                revision_number=revision_number,
                resolve_allocations=resolve_allocations,
            )
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
