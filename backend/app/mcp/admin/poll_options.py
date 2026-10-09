"""Admin (write) MCP tool implementations for volunteer meal/dinner poll options.

Mirrors ``app.routers.poll_options``. Business logic lives in
``app.services.poll_options_service`` and is shared with the REST router;
this module is responsible only for validating MCP kwargs into a schema
instance and translating ``HTTPException`` into ``MCPToolError`` at its own
boundary.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.mcp.utils import as_value_error, validate_with_schema
from app.schemas import PollOptionCreate, PollOptionUpdate
from app.services import poll_options_service
from app.translations import DEFAULT_ORIGINAL_LANGUAGE, Language
from app.utils import poll_option_to_dict


async def create_poll_option(
    session_factory: Any,
    actor: str,
    *,
    edition_id: str,
    kind: str,
    label_language: Language = DEFAULT_ORIGINAL_LANGUAGE,
    label_nl: str | None = None,
    label_fr: str | None = None,
    label_en: str | None = None,
) -> dict:
    body = validate_with_schema(
        PollOptionCreate,
        edition_id=edition_id,
        kind=kind,
        label_language=label_language,
        label_nl=label_nl,
        label_fr=label_fr,
        label_en=label_en,
    )
    async with session_factory() as db:
        try:
            option = await poll_options_service.create_poll_option(db, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return poll_option_to_dict(option)


async def list_poll_options(session_factory: Any, edition_id: str | None = None) -> list[dict]:
    async with session_factory() as db:
        options = await poll_options_service.list_poll_options(db, edition_id)
        return [poll_option_to_dict(o) for o in options]


async def update_poll_option(
    session_factory: Any,
    actor: str,
    option_id: str,
    *,
    label_language: Language | None = None,
    label_nl: str | None = None,
    label_fr: str | None = None,
    label_en: str | None = None,
) -> dict:
    """Update a label; omitted fields stay, an empty string clears a translation
    (the original language keeps its label)."""
    provided = {
        k: v
        for k, v in {
            "label_language": label_language,
            "label_nl": label_nl,
            "label_fr": label_fr,
            "label_en": label_en,
        }.items()
        if v is not None
    }
    body = validate_with_schema(PollOptionUpdate, **provided)
    async with session_factory() as db:
        try:
            option = await poll_options_service.update_poll_option(db, option_id, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return poll_option_to_dict(option)


async def delete_poll_option(session_factory: Any, actor: str, option_id: str) -> dict:
    async with session_factory() as db:
        try:
            await poll_options_service.delete_poll_option(db, option_id, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return {"deleted": True, "id": option_id}
