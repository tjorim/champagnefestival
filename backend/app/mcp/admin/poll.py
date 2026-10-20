"""Admin (write) MCP tool implementations for the volunteer poll: questions, meal options and answers.

Mirrors ``app.routers.poll_questions`` and ``app.routers.poll_options``. Business logic lives in
``app.services.poll_questions_service`` and ``app.services.poll_options_service`` and is shared with the REST
routers; this module is responsible only for validating MCP kwargs into a schema instance and translating
``HTTPException`` into ``MCPToolError`` at its own boundary.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from app.mcp.utils import as_value_error, validate_with_schema
from app.schemas import (
    AdminPollOrderIn,
    DietaryTag,
    PollAttendanceItem,
    PollOptionCreate,
    PollOptionReorder,
    PollOptionUpdate,
    PollQuestionCopy,
    PollQuestionCreate,
    PollQuestionKind,
    PollQuestionReorder,
    PollQuestionUpdate,
    PollSelectionItem,
)
from app.services import poll_options_service, poll_questions_service
from app.translations import Language

# --- Questions ------------------------------------------------------------------------------------


async def list_poll_questions(session_factory: Any, edition_id: str, locale: Language | None = None) -> list[dict]:
    async with session_factory() as db:
        try:
            return await poll_questions_service.list_poll_questions(db, edition_id, locale)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def create_poll_question(
    session_factory: Any,
    actor: str,
    *,
    edition_id: str,
    kind: PollQuestionKind,
    title_nl: str | None = None,
    title_fr: str | None = None,
    title_en: str | None = None,
    description_nl: str | None = None,
    description_fr: str | None = None,
    description_en: str | None = None,
    closes_at: datetime | None = None,
) -> dict:
    body = validate_with_schema(
        PollQuestionCreate,
        edition_id=edition_id,
        kind=kind,
        title_nl=title_nl,
        title_fr=title_fr,
        title_en=title_en,
        description_nl=description_nl,
        description_fr=description_fr,
        description_en=description_en,
        closes_at=closes_at,
    )
    async with session_factory() as db:
        try:
            return await poll_questions_service.create_poll_question(db, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def update_poll_question(
    session_factory: Any,
    actor: str,
    question_id: str,
    *,
    title_nl: str | None = None,
    title_fr: str | None = None,
    title_en: str | None = None,
    description_nl: str | None = None,
    description_fr: str | None = None,
    description_en: str | None = None,
    closes_at: datetime | None = None,
    reopen: bool = False,
) -> dict:
    """Partially update a question. ``closes_at`` sets when volunteers can no longer change their answer (a
    past time closes the question now); ``reopen=True`` clears it. Omitted fields stay as they are, and an
    empty string clears a translation."""
    if reopen and closes_at is not None:
        raise as_value_error(HTTPException(422, "Give either closes_at or reopen, not both."))
    provided: dict[str, Any] = {
        name: value
        for name, value in {
            "title_nl": title_nl,
            "title_fr": title_fr,
            "title_en": title_en,
            "description_nl": description_nl,
            "description_fr": description_fr,
            "description_en": description_en,
        }.items()
        if value is not None
    }
    if reopen:
        provided["closes_at"] = None
    elif closes_at is not None:
        provided["closes_at"] = closes_at
    body = validate_with_schema(PollQuestionUpdate, **provided)
    async with session_factory() as db:
        try:
            return await poll_questions_service.update_poll_question(db, question_id, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def delete_poll_question(
    session_factory: Any, actor: str, question_id: str, *, confirm_answers: bool = False
) -> dict:
    async with session_factory() as db:
        try:
            await poll_questions_service.delete_poll_question(
                db, question_id, actor=actor, confirm_answers=confirm_answers
            )
        except HTTPException as exc:
            raise as_value_error(exc) from exc
    return {"deleted": True, "id": question_id}


async def reorder_poll_questions(session_factory: Any, actor: str, *, edition_id: str, ordered_ids: list[str]) -> dict:
    body = validate_with_schema(PollQuestionReorder, edition_id=edition_id, ordered_ids=ordered_ids)
    async with session_factory() as db:
        try:
            return {"questions": await poll_questions_service.reorder_poll_questions(db, body, actor=actor)}
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def copy_poll_questions(session_factory: Any, actor: str, *, from_edition_id: str, to_edition_id: str) -> dict:
    body = validate_with_schema(PollQuestionCopy, from_edition_id=from_edition_id, to_edition_id=to_edition_id)
    async with session_factory() as db:
        try:
            return {"created": await poll_questions_service.copy_poll_questions(db, body, actor=actor)}
        except HTTPException as exc:
            raise as_value_error(exc) from exc


# --- Meal options ---------------------------------------------------------------------------------


async def create_poll_option(
    session_factory: Any,
    actor: str,
    *,
    question_id: str,
    label_nl: str | None = None,
    label_fr: str | None = None,
    label_en: str | None = None,
    dietary_tags: list[DietaryTag] | None = None,
) -> dict:
    body = validate_with_schema(
        PollOptionCreate,
        question_id=question_id,
        label_nl=label_nl,
        label_fr=label_fr,
        label_en=label_en,
        dietary_tags=dietary_tags or [],
    )
    async with session_factory() as db:
        try:
            return await poll_options_service.create_poll_option(db, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def list_poll_options(
    session_factory: Any,
    question_id: str | None = None,
    edition_id: str | None = None,
    locale: Language | None = None,
) -> list[dict]:
    async with session_factory() as db:
        return await poll_options_service.list_poll_options(
            db, question_id=question_id, edition_id=edition_id, locale=locale
        )


async def update_poll_option(
    session_factory: Any,
    actor: str,
    option_id: str,
    *,
    label_nl: str | None = None,
    label_fr: str | None = None,
    label_en: str | None = None,
    dietary_tags: list[DietaryTag] | None = None,
) -> dict:
    provided: dict[str, Any] = {
        k: v
        for k, v in {
            "label_nl": label_nl,
            "label_fr": label_fr,
            "label_en": label_en,
            "dietary_tags": dietary_tags,
        }.items()
        if v is not None
    }
    body = validate_with_schema(PollOptionUpdate, **provided)
    async with session_factory() as db:
        try:
            return await poll_options_service.update_poll_option(db, option_id, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def delete_poll_option(
    session_factory: Any, actor: str, option_id: str, *, confirm_selections: bool = False
) -> dict:
    async with session_factory() as db:
        try:
            await poll_options_service.delete_poll_option(
                db, option_id, actor=actor, confirm_selections=confirm_selections
            )
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return {"deleted": True, "id": option_id}


async def reorder_poll_options(session_factory: Any, actor: str, *, question_id: str, ordered_ids: list[str]) -> dict:
    body = validate_with_schema(PollOptionReorder, question_id=question_id, ordered_ids=ordered_ids)
    async with session_factory() as db:
        try:
            return {"options": await poll_options_service.reorder_poll_options(db, body, actor=actor)}
        except HTTPException as exc:
            raise as_value_error(exc) from exc


# --- Answers --------------------------------------------------------------------------------------


async def list_poll_orders(session_factory: Any, edition_id: str, locale: Language | None = None) -> dict:
    async with session_factory() as db:
        try:
            return await poll_questions_service.list_poll_orders(db, edition_id, locale)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def set_volunteer_poll_order(
    session_factory: Any,
    actor: str,
    *,
    edition_id: str,
    volunteer_id: str,
    selections: list[PollSelectionItem] | None = None,
    attendance: list[PollAttendanceItem] | None = None,
    note: str | None = None,
    confirm_closed: bool = False,
) -> dict:
    """Enter or correct a volunteer's answers. ``selections`` and ``attendance`` replace all their picks and
    yes/no answers for the edition; ``note`` omitted keeps their note and an empty string clears it. A change
    to a closed question needs ``confirm_closed``."""
    body = validate_with_schema(
        AdminPollOrderIn,
        selections=selections or [],
        attendance=attendance or [],
        note=note,
        confirm_closed=confirm_closed,
    )
    async with session_factory() as db:
        try:
            return await poll_questions_service.set_volunteer_poll_order(
                db, edition_id, volunteer_id, body, actor=actor
            )
        except HTTPException as exc:
            raise as_value_error(exc) from exc
