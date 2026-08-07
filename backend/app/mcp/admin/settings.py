"""Admin (write) MCP tool implementation for site-wide settings.

Mirrors ``app.routers.settings``. Currently just the maintenance-mode toggle.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import AppSettings
from app.utils import app_settings_to_dict

_SETTINGS_ID = "app_settings"


async def _get_or_create_settings(db: AsyncSession) -> AppSettings:
    settings = await db.get(AppSettings, _SETTINGS_ID)
    if settings is not None:
        return settings

    settings = AppSettings(id=_SETTINGS_ID)
    db.add(settings)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        settings = await db.get(AppSettings, _SETTINGS_ID)
        if settings is None:
            # The conflicting insert guarantees a row now — assert would do here,
            # but assertions are stripped under `-O`, silently returning None and
            # turning this into an AttributeError deep in the caller instead.
            raise RuntimeError("Application settings row could not be created or reloaded.") from None
        return settings
    await db.refresh(settings)
    return settings


async def get_settings(session_factory: Any) -> dict:
    async with session_factory() as db:
        return app_settings_to_dict(await _get_or_create_settings(db))


async def set_maintenance_mode(session_factory: Any, actor: str, *, maintenance_mode: bool) -> dict:
    async with session_factory() as db:
        settings = await _get_or_create_settings(db)
        settings.maintenance_mode = maintenance_mode
        await write_audit_entry(
            db,
            actor=actor,
            action="settings_updated",
            resource_type="app_settings",
            resource_id=_SETTINGS_ID,
            details={"fields_changed": ["maintenance_mode"]},
        )
        await db.commit()
        await db.refresh(settings)
        return app_settings_to_dict(settings)
