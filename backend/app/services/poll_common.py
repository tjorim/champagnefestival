"""Helpers shared by the volunteer poll services: ordering, the closing rule and row locks."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Edition, EditionPollOption, EditionPollQuestion
from app.services.errors import ApiHTTPException
from app.services.events_service import ensure_edition_exists

QUESTION_ORDER = (EditionPollQuestion.sort_order, EditionPollQuestion.created_at, EditionPollQuestion.id)
OPTION_ORDER = (EditionPollOption.sort_order, EditionPollOption.created_at, EditionPollOption.id)


def is_closed(question: EditionPollQuestion, now: datetime | None = None) -> bool:
    """True once the question has reached its closing time."""
    return question.closes_at is not None and question.closes_at <= (now or datetime.now(UTC))


def ensure_open(question: EditionPollQuestion) -> None:
    if is_closed(question):
        raise ApiHTTPException(409, "poll_question_closed", "This poll question has closed.")


async def lock_edition(db: AsyncSession, edition_id: str) -> Edition:
    """The edition row, locked so concurrent creates, reorders and copies of its questions serialize."""
    await ensure_edition_exists(db, edition_id)
    return (await db.execute(select(Edition).where(Edition.id == edition_id).with_for_update())).scalar_one()


async def get_question_or_404(db: AsyncSession, question_id: str, *, lock: bool = False) -> EditionPollQuestion:
    stmt = select(EditionPollQuestion).where(EditionPollQuestion.id == question_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    question = (await db.execute(stmt)).scalar_one_or_none()
    if question is None:
        raise ApiHTTPException(404, "poll_question_not_found", "Poll question not found.")
    return question
