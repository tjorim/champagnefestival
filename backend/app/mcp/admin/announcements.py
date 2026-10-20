"""Admin (write) MCP tool implementations for announcements.

Mirrors ``app.routers.announcements``. Business logic lives in
``app.services.announcements_service`` and is shared with the REST router.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.mcp.utils import MCPToolError, validate_with_schema
from app.schemas import AnnouncementCreate, AnnouncementLevel, AnnouncementReorder, AnnouncementUpdate
from app.services import announcements_service as service
from app.services.errors import ServiceError
from app.translations import DEFAULT_ORIGINAL_LANGUAGE, Language


async def list_announcements(session_factory: Any) -> dict:
    """Every announcement, active or not, in display order (admin shape)."""
    async with session_factory() as db:
        return {"announcements": await service.list_all(db)}


async def create_announcement(
    session_factory: Any,
    actor: str,
    *,
    text_language: Language = DEFAULT_ORIGINAL_LANGUAGE,
    text_nl: str | None = None,
    text_fr: str | None = None,
    text_en: str | None = None,
    level: AnnouncementLevel = "info",
    active: bool = False,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    link_url: str | None = None,
    link_label_nl: str | None = None,
    link_label_fr: str | None = None,
    link_label_en: str | None = None,
) -> dict:
    body = validate_with_schema(
        AnnouncementCreate,
        text_language=text_language,
        text_nl=text_nl,
        text_fr=text_fr,
        text_en=text_en,
        level=level,
        active=active,
        starts_at=starts_at,
        ends_at=ends_at,
        link_url=link_url,
        link_label_nl=link_label_nl,
        link_label_fr=link_label_fr,
        link_label_en=link_label_en,
    )
    async with session_factory() as db:
        try:
            return await service.create(db, actor=actor, body=body, request_id=None)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def update_announcement(
    session_factory: Any,
    actor: str,
    announcement_id: str,
    *,
    text_language: Language | None = None,
    text_nl: str | None = None,
    text_fr: str | None = None,
    text_en: str | None = None,
    level: AnnouncementLevel | None = None,
    active: bool | None = None,
    starts_at: datetime | None = None,
    clear_starts_at: bool = False,
    ends_at: datetime | None = None,
    clear_ends_at: bool = False,
    link_url: str | None = None,
    clear_link_url: bool = False,
    link_label_nl: str | None = None,
    link_label_fr: str | None = None,
    link_label_en: str | None = None,
) -> dict:
    """Update an announcement.

    Omitted (``None``) leaves a field untouched; an explicit empty string clears a
    translation or a link label, and the ``clear_*`` flags remove the schedule window ends
    and the link. The merged result is validated, so the original language must keep its text
    (and its link label while there is a link).
    """
    provided: dict[str, Any] = {
        k: v
        for k, v in {
            "text_language": text_language,
            "text_nl": text_nl,
            "text_fr": text_fr,
            "text_en": text_en,
            "level": level,
            "active": active,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "link_url": link_url,
            "link_label_nl": link_label_nl,
            "link_label_fr": link_label_fr,
            "link_label_en": link_label_en,
        }.items()
        if v is not None
    }
    for name, clear in (("starts_at", clear_starts_at), ("ends_at", clear_ends_at), ("link_url", clear_link_url)):
        if clear:
            provided[name] = None
    body = validate_with_schema(AnnouncementUpdate, **provided)
    async with session_factory() as db:
        try:
            return await service.update(db, actor=actor, item_id=announcement_id, body=body, request_id=None)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def reorder_announcements(session_factory: Any, actor: str, *, ordered_ids: list[str]) -> dict:
    """Reassign every announcement's display position to match ``ordered_ids``."""
    body = validate_with_schema(AnnouncementReorder, ordered_ids=ordered_ids)
    async with session_factory() as db:
        try:
            return {
                "announcements": await service.reorder(db, actor=actor, ordered_ids=body.ordered_ids, request_id=None)
            }
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_announcement(session_factory: Any, actor: str, announcement_id: str) -> dict:
    async with session_factory() as db:
        try:
            await service.delete(db, actor=actor, item_id=announcement_id, request_id=None)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
    return {"deleted": True, "id": announcement_id}
