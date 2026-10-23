"""Admin (write) MCP tool implementations for legal/policy documents.

Mirrors the admin routes of ``app.routers.policies``. Business logic lives in
``app.services.policies_service`` and is shared with the REST router. The public
``/current`` route has no tool: it is an unauthenticated rendering of the
published version, and ``get_policy`` returns the same content in its source form.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import PolicyDraftCreate, PolicyDraftUpdate, PolicyRenderRequest
from app.services import policies_service as service
from app.services.errors import ServiceError
from app.services.policy_markdown import render_markdown


async def list_policies(session_factory: Any) -> dict:
    """Every policy with its full version history, newest version first."""
    async with session_factory() as db:
        return {"policies": await service.list_policies(db)}


async def get_policy(session_factory: Any, policy_key: str) -> dict:
    async with session_factory() as db:
        try:
            return await service.get_policy(db, policy_key=policy_key)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def preview_policy_markdown(markdown: str) -> dict:
    """Render Markdown with the same renderer and sanitizer as the public output."""
    body = validate_with_schema(PolicyRenderRequest, markdown=markdown)
    return {"html": render_markdown(body.markdown)}


async def create_policy_draft(
    session_factory: Any, actor: str, policy_key: str, *, source_version_number: int | None = None
) -> dict:
    """Open a draft seeded from the published version, or from an older version (rollback)."""
    body = validate_with_schema(PolicyDraftCreate, source_version_number=source_version_number)
    async with session_factory() as db:
        try:
            return await service.create_draft(db, actor=actor, policy_key=policy_key, body=body, request_id=None)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def update_policy_draft(
    session_factory: Any,
    actor: str,
    policy_key: str,
    *,
    content_nl: str | None = None,
    content_fr: str | None = None,
    content_en: str | None = None,
    change_summary: str | None = None,
) -> dict:
    """Edit the open draft. Omitted (``None``) leaves a field untouched; an explicit
    empty string clears a translation."""
    provided = {
        k: v
        for k, v in {
            "content_nl": content_nl,
            "content_fr": content_fr,
            "content_en": content_en,
            "change_summary": change_summary,
        }.items()
        if v is not None
    }
    body = validate_with_schema(PolicyDraftUpdate, **provided)
    async with session_factory() as db:
        try:
            return await service.update_draft(db, actor=actor, policy_key=policy_key, body=body, request_id=None)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def discard_policy_draft(session_factory: Any, actor: str, policy_key: str) -> dict:
    async with session_factory() as db:
        try:
            await service.discard_draft(db, actor=actor, policy_key=policy_key, request_id=None)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
    return {"discarded": True, "policy_key": policy_key}


async def publish_policy_draft(session_factory: Any, actor: str, policy_key: str) -> dict:
    """Publish the open draft; the previous published version becomes superseded."""
    async with session_factory() as db:
        try:
            return await service.publish_draft(db, actor=actor, policy_key=policy_key, request_id=None)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
