"""Admin (write) MCP tool implementations for the central composer.

Mirrors ``app.routers.composer``. Business logic lives in
``app.services.composer_service`` and is shared with the REST router; delivery
itself runs through the durable outbox, so scheduling only enqueues it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.ratelimit import check_rate_limit
from app.schemas import (
    AnnouncementLevel,
    ComposedMessageCreate,
    ComposedMessageScheduleRequest,
    ComposedMessageToolChannel,
    ComposedMessageUpdate,
)
from app.services import composer_service as service
from app.services.errors import ServiceError


async def list_composed_messages(session_factory: Any) -> dict:
    """Every composed message, newest first, with its state and push delivery counts."""
    async with session_factory() as db:
        return {"messages": await service.list_messages(db)}


async def get_composed_message(session_factory: Any, message_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await service.to_dict(db, await service.get_message(db, message_id))
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def create_composed_message(
    session_factory: Any,
    actor: str,
    *,
    channels: list[ComposedMessageToolChannel],
    title_nl: str | None = None,
    title_fr: str | None = None,
    title_en: str | None = None,
    body_nl: str | None = None,
    body_fr: str | None = None,
    body_en: str | None = None,
    level: AnnouncementLevel = "info",
    link_url: str | None = None,
) -> dict:
    body = validate_with_schema(
        ComposedMessageCreate,
        channels=channels,
        title_nl=title_nl,
        title_fr=title_fr,
        title_en=title_en,
        body_nl=body_nl,
        body_fr=body_fr,
        body_en=body_en,
        level=level,
        link_url=link_url,
    )
    async with session_factory() as db:
        try:
            return await service.create_draft(db, actor=actor, body=body, request_id=None)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def update_composed_message(
    session_factory: Any,
    actor: str,
    message_id: str,
    *,
    channels: list[ComposedMessageToolChannel] | None = None,
    title_nl: str | None = None,
    title_fr: str | None = None,
    title_en: str | None = None,
    body_nl: str | None = None,
    body_fr: str | None = None,
    body_en: str | None = None,
    level: AnnouncementLevel | None = None,
    link_url: str | None = None,
    clear_link_url: bool = False,
) -> dict:
    """Update a composed message that is still a draft.

    Omitted (``None``) leaves a field untouched; an explicit empty string clears a
    translation and ``clear_link_url`` removes the link. The merged result is validated.
    """
    provided: dict[str, Any] = {
        k: v
        for k, v in {
            "channels": channels,
            "title_nl": title_nl,
            "title_fr": title_fr,
            "title_en": title_en,
            "body_nl": body_nl,
            "body_fr": body_fr,
            "body_en": body_en,
            "level": level,
            "link_url": link_url,
        }.items()
        if v is not None
    }
    if clear_link_url:
        provided["link_url"] = None
    body = validate_with_schema(ComposedMessageUpdate, **provided)
    async with session_factory() as db:
        try:
            return await service.update_draft(db, actor=actor, message_id=message_id, body=body, request_id=None)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def schedule_composed_message(
    session_factory: Any, actor: str, message_id: str, *, scheduled_at: datetime | None = None
) -> dict:
    """Send a draft: ``scheduled_at`` omitted publishes as soon as the worker next polls."""
    body = validate_with_schema(ComposedMessageScheduleRequest, scheduled_at=scheduled_at)
    # Same in-process limiter and scope as the REST route: a low-volume, outward-facing action.
    if not check_rate_limit(actor, scope="composer-schedule", max_requests=10):
        raise MCPToolError("Too many requests. Please try again later.")
    async with session_factory() as db:
        try:
            return await service.schedule_send(
                db, actor=actor, message_id=message_id, scheduled_at=body.scheduled_at, request_id=None
            )
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
