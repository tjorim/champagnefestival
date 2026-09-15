"""Edition-scoped volunteer meal/dinner poll option management (admin only).

Business logic lives in ``app.services.poll_options_service`` and is shared
with ``app.mcp.admin.poll_options``, following the same convention as
``app.routers.products``.
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import EditionPollOption
from app.schemas import PollOptionCreate, PollOptionOut, PollOptionUpdate
from app.services import poll_options_service

router = APIRouter(
    prefix="/api/poll-options",
    tags=["poll-options"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=PollOptionOut, status_code=status.HTTP_201_CREATED)
async def create_poll_option(
    body: PollOptionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> EditionPollOption:
    return await poll_options_service.create_poll_option(
        db, body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.get("", response_model=list[PollOptionOut])
async def list_poll_options(
    db: AsyncSession = Depends(get_db),
    edition_id: str | None = Query(default=None),
) -> list[EditionPollOption]:
    return await poll_options_service.list_poll_options(db, edition_id)


@router.put("/{option_id}", response_model=PollOptionOut)
async def update_poll_option(
    option_id: str,
    body: PollOptionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> EditionPollOption:
    return await poll_options_service.update_poll_option(
        db, option_id, body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.delete("/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_poll_option(
    option_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    await poll_options_service.delete_poll_option(
        db, option_id, actor=actor, request_id=getattr(request.state, "request_id", None)
    )
