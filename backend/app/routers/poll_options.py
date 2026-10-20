"""Meal options of a ``meals`` poll question (admin only).

The questions themselves, who answered what and the volunteer's own answers are in
``app.routers.poll_questions``. Business logic lives in ``app.services.poll_options_service`` and is shared
with ``app.mcp.admin.poll_options``.
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import FaqLocale, PollOptionCreate, PollOptionOut, PollOptionReorder, PollOptionUpdate
from app.services import poll_options_service

router = APIRouter(
    prefix="/api/poll-options",
    tags=["poll-options"],
    dependencies=[Depends(require_admin)],
)


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


@router.post("", response_model=PollOptionOut, status_code=status.HTTP_201_CREATED)
async def create_poll_option(
    body: PollOptionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await poll_options_service.create_poll_option(db, body, actor=actor, request_id=_request_id(request))


@router.get("", response_model=list[PollOptionOut])
async def list_poll_options(
    db: AsyncSession = Depends(get_db),
    question_id: str | None = Query(default=None),
    edition_id: str | None = Query(default=None),
    locale: FaqLocale | None = Query(default=None),
) -> list[dict]:
    return await poll_options_service.list_poll_options(
        db, question_id=question_id, edition_id=edition_id, locale=locale
    )


@router.post("/reorder", response_model=list[PollOptionOut])
async def reorder_poll_options(
    body: PollOptionReorder,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> list[dict]:
    return await poll_options_service.reorder_poll_options(db, body, actor=actor, request_id=_request_id(request))


@router.put("/{option_id}", response_model=PollOptionOut)
async def update_poll_option(
    option_id: str,
    body: PollOptionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await poll_options_service.update_poll_option(
        db, option_id, body, actor=actor, request_id=_request_id(request)
    )


@router.delete("/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_poll_option(
    option_id: str,
    request: Request,
    confirm_selections: bool = Query(
        default=False, description="Required when volunteers already picked the option; their picks are removed."
    ),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    await poll_options_service.delete_poll_option(
        db, option_id, actor=actor, request_id=_request_id(request), confirm_selections=confirm_selections
    )
