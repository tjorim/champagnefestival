"""Site-wide settings — currently just the maintenance-mode toggle."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import AppSettings
from app.schemas import AppSettingsOut, AppSettingsUpdate
from app.utils import app_settings_to_dict

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
)

_SETTINGS_ID = "app_settings"


async def _get_or_create_settings(db: AsyncSession) -> AppSettings:
    settings = await db.get(AppSettings, _SETTINGS_ID)
    if settings is not None:
        return settings

    # Two concurrent first requests can both see no row and both try to insert
    # the fixed id; the loser's commit raises IntegrityError rather than a
    # second row. Roll back and re-fetch instead of erroring out — either
    # request landing on the same row is a correct outcome here.
    settings = AppSettings(id=_SETTINGS_ID)
    db.add(settings)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        settings = await db.get(AppSettings, _SETTINGS_ID)
        assert settings is not None  # the conflicting insert guarantees a row now
        return settings
    await db.refresh(settings)
    return settings


@router.get("", response_model=AppSettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)) -> dict:
    return app_settings_to_dict(await _get_or_create_settings(db))


@router.put("", response_model=AppSettingsOut)
async def update_settings(
    body: AppSettingsUpdate,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    settings = await _get_or_create_settings(db)
    if body.maintenance_mode is not None:
        settings.maintenance_mode = body.maintenance_mode
    await write_audit_entry(
        db,
        actor=actor,
        action="settings_updated",
        resource_type="app_settings",
        resource_id=_SETTINGS_ID,
        request_id=getattr(request.state, "request_id", None),
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(settings)
    return app_settings_to_dict(settings)
