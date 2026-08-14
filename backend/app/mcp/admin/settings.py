"""Admin (write) MCP tool implementation for site-wide settings.

Mirrors ``app.routers.settings``. Business logic lives in
``app.services.settings_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import validate_with_schema
from app.schemas import AppSettingsUpdate
from app.services import settings_service


async def get_settings(session_factory: Any) -> dict:
    async with session_factory() as db:
        return await settings_service.get_settings(db)


async def set_maintenance_mode(session_factory: Any, actor: str, *, maintenance_mode: bool) -> dict:
    body = validate_with_schema(AppSettingsUpdate, maintenance_mode=maintenance_mode)
    async with session_factory() as db:
        return await settings_service.update_settings(db, actor=actor, body=body)
