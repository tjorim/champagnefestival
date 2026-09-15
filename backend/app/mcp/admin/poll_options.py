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
from app.models import EditionPollOption
from app.schemas import PollOptionCreate, PollOptionUpdate
from app.services import poll_options_service


def _poll_option_dict(option: EditionPollOption) -> dict:
    return {
        "id": option.id,
        "edition_id": option.edition_id,
        "kind": option.kind,
        "label": option.label,
        "created_at": option.created_at,
        "updated_at": option.updated_at,
    }


async def create_poll_option(
    session_factory: Any,
    actor: str,
    *,
    edition_id: str,
    kind: str,
    label: str,
) -> dict:
    body = validate_with_schema(PollOptionCreate, edition_id=edition_id, kind=kind, label=label)
    async with session_factory() as db:
        try:
            option = await poll_options_service.create_poll_option(db, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return _poll_option_dict(option)


async def list_poll_options(session_factory: Any, edition_id: str | None = None) -> list[dict]:
    async with session_factory() as db:
        options = await poll_options_service.list_poll_options(db, edition_id)
        return [_poll_option_dict(o) for o in options]


async def update_poll_option(session_factory: Any, actor: str, option_id: str, *, label: str) -> dict:
    body = validate_with_schema(PollOptionUpdate, label=label)
    async with session_factory() as db:
        try:
            option = await poll_options_service.update_poll_option(db, option_id, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return _poll_option_dict(option)


async def delete_poll_option(session_factory: Any, actor: str, option_id: str) -> dict:
    async with session_factory() as db:
        try:
            await poll_options_service.delete_poll_option(db, option_id, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return {"deleted": True, "id": option_id}
