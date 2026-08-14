"""Site-wide settings — currently just the maintenance-mode toggle.

Business logic lives in ``app.services.settings_service`` and is shared with
``app.mcp.admin.settings``.
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import AppSettingsOut, AppSettingsUpdate
from app.services import settings_service

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
)


@router.get("", response_model=AppSettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)) -> dict:
    return await settings_service.get_settings(db)


@router.put("", response_model=AppSettingsOut)
async def update_settings(
    body: AppSettingsUpdate,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await settings_service.update_settings(
        db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
    )
