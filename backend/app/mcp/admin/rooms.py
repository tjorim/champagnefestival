"""Admin (write) MCP tool implementations for room management.

Mirrors ``app.routers.rooms``. Business logic lives in
``app.services.rooms_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import RoomCreate, RoomUpdate
from app.services import rooms_service
from app.services.errors import ServiceError


async def create_room(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    venue_id: str,
    width_m: float,
    length_m: float,
    color: str = "#6c757d",
    active: bool = True,
) -> dict:
    body = validate_with_schema(
        RoomCreate,
        name=name,
        venue_id=venue_id,
        width_m=width_m,
        length_m=length_m,
        color=color,
        active=active,
    )
    async with session_factory() as db:
        try:
            return await rooms_service.create_room(db, actor=actor, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def bulk_create_rooms(
    session_factory: Any,
    actor: str,
    *,
    items: list[RoomCreate],
    idempotency_key: str | None = None,
) -> dict:
    async with session_factory() as db:
        try:
            return await rooms_service.bulk_create_rooms(db, actor=actor, items=items, idempotency_key=idempotency_key)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def list_rooms(session_factory: Any, venue_id: str | None = None) -> dict:
    async with session_factory() as db:
        return {"rooms": await rooms_service.list_rooms(db, venue_id)}


async def get_room(session_factory: Any, room_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await rooms_service.get_room(db, room_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def update_room(
    session_factory: Any,
    actor: str,
    room_id: str,
    *,
    venue_id: str | None = None,
    name: str | None = None,
    width_m: float | None = None,
    length_m: float | None = None,
    color: str | None = None,
    active: bool | None = None,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "venue_id": venue_id,
            "name": name,
            "width_m": width_m,
            "length_m": length_m,
            "color": color,
            "active": active,
        }.items()
        if v is not None
    }
    body = validate_with_schema(RoomUpdate, **provided)
    async with session_factory() as db:
        try:
            return await rooms_service.update_room(db, actor=actor, room_id=room_id, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_room(session_factory: Any, actor: str, room_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await rooms_service.delete_room(db, actor=actor, room_id=room_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
