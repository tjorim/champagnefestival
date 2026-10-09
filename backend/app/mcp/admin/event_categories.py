"""Admin (write) MCP tool implementations for event categories.

Mirrors ``app.routers.event_categories``; business logic lives in
``app.services.event_categories_service``.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import CategoryCreate, CategoryUpdate
from app.services import event_categories_service
from app.services.errors import ServiceError
from app.translations import DEFAULT_ORIGINAL_LANGUAGE, Language


async def list_event_categories(session_factory: Any, locale: str | None = None) -> dict:
    async with session_factory() as db:
        return {"event_categories": await event_categories_service.list_categories(db, locale=locale)}


async def create_event_category(
    session_factory: Any,
    actor: str,
    *,
    key: str,
    label_language: Language = DEFAULT_ORIGINAL_LANGUAGE,
    label_nl: str | None = None,
    label_fr: str | None = None,
    label_en: str | None = None,
    sort_order: int = 0,
) -> dict:
    body = validate_with_schema(
        CategoryCreate,
        key=key,
        label_language=label_language,
        label_nl=label_nl,
        label_fr=label_fr,
        label_en=label_en,
        sort_order=sort_order,
    )
    async with session_factory() as db:
        try:
            return await event_categories_service.create_category(db, actor=actor, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def update_event_category(
    session_factory: Any,
    actor: str,
    key: str,
    *,
    label_language: Language | None = None,
    label_nl: str | None = None,
    label_fr: str | None = None,
    label_en: str | None = None,
    sort_order: int | None = None,
) -> dict:
    """Partially update a category; omitted fields are left unchanged and an empty
    string clears a translation (the original-language label cannot be cleared)."""
    provided = {
        name: value
        for name, value in {
            "label_language": label_language,
            "label_nl": label_nl,
            "label_fr": label_fr,
            "label_en": label_en,
            "sort_order": sort_order,
        }.items()
        if value is not None
    }
    body = validate_with_schema(CategoryUpdate, **provided)
    async with session_factory() as db:
        try:
            return await event_categories_service.update_category(db, actor=actor, key=key, body=body)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_event_category(session_factory: Any, actor: str, key: str) -> dict:
    async with session_factory() as db:
        try:
            return await event_categories_service.delete_category(db, actor=actor, key=key)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
