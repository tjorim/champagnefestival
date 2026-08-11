"""Admin (write) MCP tool implementations for floor-plan area management.

Mirrors ``app.routers.areas``. Business logic lives in
``app.services.areas_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import AreaCreate, AreaUpdate
from app.services import areas_service
from app.services.errors import ServiceError


async def create_area(
    session_factory: Any,
    actor: str,
    *,
    layout_id: str,
    label: str,
    icon: str = "bi-shop",
    exhibitor_id: int | None = None,
    width_m: float = 1.5,
    length_m: float = 1.0,
    x: float = 50.0,
    y: float = 50.0,
    rotation: int = 0,
) -> dict:
    body = validate_with_schema(
        AreaCreate,
        layout_id=layout_id,
        label=label,
        icon=icon,
        exhibitor_id=exhibitor_id,
        width_m=width_m,
        length_m=length_m,
        x=x,
        y=y,
        rotation=rotation,
    )
    async with session_factory() as db:
        try:
            return await areas_service.create_area(db, actor=actor, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def list_areas(session_factory: Any, layout_id: str | None = None) -> dict:
    async with session_factory() as db:
        return {"areas": await areas_service.list_areas(db, layout_id)}


async def get_area(session_factory: Any, area_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await areas_service.get_area(db, area_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def update_area(
    session_factory: Any,
    actor: str,
    area_id: str,
    *,
    label: str | None = None,
    icon: str | None = None,
    exhibitor_id: int | None = None,
    clear_exhibitor_id: bool = False,
    width_m: float | None = None,
    length_m: float | None = None,
    x: float | None = None,
    y: float | None = None,
    rotation: int | None = None,
) -> dict:
    provided: dict[str, Any] = {
        k: v
        for k, v in {
            "label": label,
            "icon": icon,
            "width_m": width_m,
            "length_m": length_m,
            "x": x,
            "y": y,
            "rotation": rotation,
        }.items()
        if v is not None
    }
    # exhibitor_id has no natural "clear" sentinel (a real exhibitor id is
    # never legitimately blank), so clear_exhibitor_id distinguishes "leave
    # unchanged" (omitted, clear_exhibitor_id=False) from "explicitly unset"
    # (clear_exhibitor_id=True) the way REST distinguishes an absent JSON key
    # from an explicit ``null`` via ``model_fields_set``.
    if exhibitor_id is not None and clear_exhibitor_id:
        raise MCPToolError("Pass either exhibitor_id or clear_exhibitor_id, not both.")
    if exhibitor_id is not None:
        provided["exhibitor_id"] = exhibitor_id
    elif clear_exhibitor_id:
        provided["exhibitor_id"] = None

    body = validate_with_schema(AreaUpdate, **provided)
    async with session_factory() as db:
        try:
            return await areas_service.update_area(db, actor=actor, area_id=area_id, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_area(session_factory: Any, actor: str, area_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await areas_service.delete_area(db, actor=actor, area_id=area_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
