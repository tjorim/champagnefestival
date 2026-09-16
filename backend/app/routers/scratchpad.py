"""Admin scratchpad — a single shared free-text notepad for general planning
notes, not tied to any volunteer, period, or edition.

Business logic lives in ``app.services.scratchpad_service``. Browser-only, no
MCP equivalent, matching ``app.routers.contact``/``app.routers.waitlist``.
Admin-only end to end (unlike ``app.routers.settings``, whose ``GET`` is
public) since this is internal planning content, never meant for visitors.
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import AdminScratchpadOut, AdminScratchpadUpdate
from app.services import scratchpad_service

router = APIRouter(prefix="/api/scratchpad", tags=["scratchpad"], dependencies=[Depends(require_admin)])


@router.get("", response_model=AdminScratchpadOut)
async def get_scratchpad(db: AsyncSession = Depends(get_db)) -> dict:
    return await scratchpad_service.get_scratchpad(db)


@router.put("", response_model=AdminScratchpadOut)
async def update_scratchpad(
    body: AdminScratchpadUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await scratchpad_service.update_scratchpad(
        db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
    )
