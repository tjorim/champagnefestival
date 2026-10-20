"""Volunteer poll questions of an edition, and who answered what (admin only).

A question is ``yes_no`` (will you join this, with how many people) or ``meals`` (pick dishes; the options
are managed through ``app.routers.poll_options``). Each question has its own optional closing time.
Business logic lives in ``app.services.poll_questions_service`` and is shared with ``app.mcp.admin.poll_options``.
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import (
    AdminPollOrderIn,
    FaqLocale,
    PollOrdersOut,
    PollQuestionCopy,
    PollQuestionCreate,
    PollQuestionOut,
    PollQuestionReorder,
    PollQuestionUpdate,
    PollVolunteerOrderOut,
)
from app.services import poll_questions_service

router = APIRouter(
    prefix="/api/poll-questions",
    tags=["poll-questions"],
    dependencies=[Depends(require_admin)],
)


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


@router.get("", response_model=list[PollQuestionOut])
async def list_poll_questions(
    edition_id: str = Query(),
    locale: FaqLocale | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await poll_questions_service.list_poll_questions(db, edition_id, locale)


@router.post("", response_model=PollQuestionOut, status_code=status.HTTP_201_CREATED)
async def create_poll_question(
    body: PollQuestionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await poll_questions_service.create_poll_question(db, body, actor=actor, request_id=_request_id(request))


@router.get("/orders", response_model=PollOrdersOut)
async def list_poll_orders(
    edition_id: str = Query(),
    locale: FaqLocale | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await poll_questions_service.list_poll_orders(db, edition_id, locale)


@router.put("/orders/{volunteer_id}", response_model=PollVolunteerOrderOut)
async def set_volunteer_poll_order(
    volunteer_id: str,
    body: AdminPollOrderIn,
    request: Request,
    edition_id: str = Query(),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    """Enter or correct a volunteer's answers and dietary note (replacing their picks and yes/no answers for
    the edition), also for closed questions (then `confirm_closed` must be true)."""
    return await poll_questions_service.set_volunteer_poll_order(
        db, edition_id, volunteer_id, body, actor=actor, request_id=_request_id(request)
    )


@router.post("/reorder", response_model=list[PollQuestionOut])
async def reorder_poll_questions(
    body: PollQuestionReorder,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> list[dict]:
    return await poll_questions_service.reorder_poll_questions(db, body, actor=actor, request_id=_request_id(request))


@router.post("/copy", response_model=list[PollQuestionOut], status_code=status.HTTP_201_CREATED)
async def copy_poll_questions(
    body: PollQuestionCopy,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> list[dict]:
    return await poll_questions_service.copy_poll_questions(db, body, actor=actor, request_id=_request_id(request))


@router.put("/{question_id}", response_model=PollQuestionOut)
async def update_poll_question(
    question_id: str,
    body: PollQuestionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await poll_questions_service.update_poll_question(
        db, question_id, body, actor=actor, request_id=_request_id(request)
    )


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_poll_question(
    question_id: str,
    request: Request,
    confirm_answers: bool = Query(
        default=False, description="Required when volunteers already answered; their answers are removed."
    ),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    await poll_questions_service.delete_poll_question(
        db, question_id, actor=actor, request_id=_request_id(request), confirm_answers=confirm_answers
    )
