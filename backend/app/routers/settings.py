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


@router.get("", response_model=AppSettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)) -> dict:
    settings = await _get_or_create_settings(db)
    await db.commit()  # persist a freshly-created default row; a no-op otherwise
    return app_settings_to_dict(settings)


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
