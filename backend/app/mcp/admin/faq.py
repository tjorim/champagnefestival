"""Admin (write) MCP tool implementations for FAQ item management.

Mirrors ``app.routers.faq``. Business logic lives in
``app.services.faq_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import FaqItemCreate, FaqItemReorder, FaqItemUpdate
from app.services import faq_service
from app.services.errors import ServiceError


async def create_faq_item(
    session_factory: Any,
    actor: str,
    *,
    question_nl: str,
    answer_nl: str,
    question_en: str | None = None,
    answer_en: str | None = None,
    question_fr: str | None = None,
    answer_fr: str | None = None,
    active: bool = True,
) -> dict:
    body = validate_with_schema(
        FaqItemCreate,
        question_nl=question_nl,
        answer_nl=answer_nl,
        question_en=question_en or None,
        answer_en=answer_en or None,
        question_fr=question_fr or None,
        answer_fr=answer_fr or None,
        active=active,
    )
    async with session_factory() as db:
        try:
            return await faq_service.create_faq_item(db, actor=actor, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def list_faq_items(session_factory: Any) -> dict:
    """Every FAQ item and every locale, active or not, in display order (admin shape)."""
    async with session_factory() as db:
        return {"faq_items": await faq_service.list_faq_items(db)}


async def update_faq_item(
    session_factory: Any,
    actor: str,
    faq_item_id: str,
    *,
    question_nl: str | None = None,
    answer_nl: str | None = None,
    question_en: str | None = None,
    answer_en: str | None = None,
    question_fr: str | None = None,
    answer_fr: str | None = None,
    active: bool | None = None,
) -> dict:
    """Update an FAQ item.

    ``question_en``/``answer_en``/``question_fr``/``answer_fr`` follow the
    module-level convention: omitted (``None``) leaves the locale untouched;
    an explicit empty string clears it, hiding the item on that locale's FAQ.
    """
    provided = {
        k: v
        for k, v in {
            "question_nl": question_nl,
            "answer_nl": answer_nl,
            "question_en": question_en,
            "answer_en": answer_en,
            "question_fr": question_fr,
            "answer_fr": answer_fr,
            "active": active,
        }.items()
        if v is not None
    }
    body = validate_with_schema(FaqItemUpdate, **provided)
    async with session_factory() as db:
        try:
            return await faq_service.update_faq_item(db, actor=actor, faq_item_id=faq_item_id, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_faq_item(session_factory: Any, actor: str, faq_item_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await faq_service.delete_faq_item(db, actor=actor, faq_item_id=faq_item_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def reorder_faq_items(session_factory: Any, actor: str, *, ordered_ids: list[str]) -> dict:
    """Reassign every FAQ item's display position to match ``ordered_ids``.

    ``ordered_ids`` must name every existing FAQ item exactly once — the same
    semantics the admin UI's reorder control uses (#836).
    """
    body = validate_with_schema(FaqItemReorder, ordered_ids=ordered_ids)
    async with session_factory() as db:
        try:
            return {"faq_items": await faq_service.reorder_faq_items(db, actor=actor, ordered_ids=body.ordered_ids)}
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
