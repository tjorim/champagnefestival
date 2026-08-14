"""Shared application-service operations for site-wide settings.

Used by both ``app.routers.settings`` (REST) and ``app.mcp.admin.settings``
(MCP) so the lazy-row-creation race handling and audit-detail assembly live
in exactly one place instead of two copies (#860). Settings endpoints raise
plain exceptions rather than the ``ServiceError`` hierarchy in
``app/services/errors.py`` since there's currently no user-facing failure mode
to translate — see ``app/services/editions_service.py`` for the sibling
convention this follows when one is needed.
"""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import AppSettings
from app.schemas import AppSettingsUpdate
from app.utils import app_settings_to_dict

_SETTINGS_ID = "app_settings"


async def get_or_create_settings(db: AsyncSession) -> AppSettings:
    settings = await db.get(AppSettings, _SETTINGS_ID)
    if settings is not None:
        return settings

    # Two concurrent first requests can both see no row and both try to insert
    # the fixed id; the loser's flush raises IntegrityError rather than a
    # second row. Roll back and re-fetch instead of erroring out — either
    # request landing on the same row is a correct outcome here.
    #
    # Flushes rather than commits, so the caller controls the transaction
    # boundary — update_settings folds the row creation, the mutation, and the
    # audit entry into one atomic commit instead of two separate ones.
    settings = AppSettings(id=_SETTINGS_ID)
    db.add(settings)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        settings = await db.get(AppSettings, _SETTINGS_ID)
        if settings is None:
            # The conflicting insert guarantees a row now — assert would do here,
            # but assertions are stripped under `-O`, silently returning None and
            # turning this into an AttributeError deep in the caller instead.
            raise RuntimeError("Application settings row could not be created or reloaded.") from None
        return settings
    return settings


async def get_settings(db: AsyncSession) -> dict:
    settings = await get_or_create_settings(db)
    await db.commit()  # persist a freshly-created default row; a no-op otherwise
    return app_settings_to_dict(settings)


async def update_settings(
    db: AsyncSession, *, actor: str, body: AppSettingsUpdate, request_id: str | None = None
) -> dict:
    settings = await get_or_create_settings(db)
    if body.maintenance_mode is not None:
        settings.maintenance_mode = body.maintenance_mode
    await write_audit_entry(
        db,
        actor=actor,
        action="settings_updated",
        resource_type="app_settings",
        resource_id=_SETTINGS_ID,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(settings)
    return app_settings_to_dict(settings)
