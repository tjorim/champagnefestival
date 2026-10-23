"""Admin MCP tool implementations for digital signage.

Mirrors the admin routes of ``app.routers.signage``. Transactions, slot checks and the
privacy-reviewed playlist live in ``app.services.signage_service``, shared with the REST
router; every mutation takes the same advisory lock and writes the same audit entries.

Image uploads stay browser-only (they need the file bytes), so a background, layer or slide
can reference an image only after it was uploaded there; text, icon, shape and binding
layers, notices and organization slides need no upload.

Update tools follow the partial-update convention of this package: an omitted argument
keeps the stored value. ``background``, ``layers`` and ``content`` are documents and are
replaced as a whole when given.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel

from app.mcp.utils import as_value_error, validate_with_schema
from app.schemas import FaqLocale
from app.services import signage_service as service
from app.signage_schemas import (
    ChannelOut,
    ChannelWrite,
    PlaylistPreview,
    Reorder,
    SlideKind,
    SlideOut,
    SlideWrite,
    TemplateOut,
    TemplateWrite,
)


def _dump(schema: type[BaseModel], item: Any) -> dict:
    return schema.model_validate(item).model_dump(mode="json")


async def _list(session_factory: Any, resource: str, out: type[BaseModel]) -> list[dict]:
    async with session_factory() as db:
        return [_dump(out, item) for item in await service.list_all(db, resource)]


async def _get(session_factory: Any, resource: str, out: type[BaseModel], item_id: str) -> dict:
    async with session_factory() as db:
        try:
            return _dump(out, await service.get(db, resource, item_id))
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def _create(
    session_factory: Any, actor: str, resource: str, write: type[BaseModel], out: type[BaseModel], **fields: Any
) -> dict:
    body = validate_with_schema(write, **fields)
    async with session_factory() as db:
        try:
            return _dump(out, await service.save(db, resource, body, actor, None))
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def _update(
    session_factory: Any,
    actor: str,
    resource: str,
    write: type[BaseModel],
    out: type[BaseModel],
    item_id: str,
    provided: dict[str, Any],
) -> dict:
    """Merge ``provided`` over the stored document, then validate and save it like a REST PUT."""
    async with session_factory() as db:
        try:
            item = await service.get(db, resource, item_id)
            merged = {name: getattr(item, name) for name in write.model_fields}
            merged.update(provided)
            body = validate_with_schema(write, **merged)
            return _dump(out, await service.save(db, resource, body, actor, None, item_id))
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def _delete(session_factory: Any, actor: str, resource: str, item_id: str) -> dict:
    async with session_factory() as db:
        try:
            await service.delete(db, resource, item_id, actor, None)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
    return {"deleted": True, "id": item_id}


def _given(**fields: Any) -> dict[str, Any]:
    return {name: value for name, value in fields.items() if value is not None}


# -- Channels ---------------------------------------------------------------


async def list_signage_channels(session_factory: Any) -> dict:
    return {"channels": await _list(session_factory, "channels", ChannelOut)}


async def get_signage_channel(session_factory: Any, channel_id: str) -> dict:
    return await _get(session_factory, "channels", ChannelOut, channel_id)


async def create_signage_channel(
    session_factory: Any, actor: str, *, slug: str, name: str, edition_id: str, active: bool = False
) -> dict:
    return await _create(
        session_factory,
        actor,
        "channels",
        ChannelWrite,
        ChannelOut,
        slug=slug,
        name=name,
        edition_id=edition_id,
        active=active,
    )


async def update_signage_channel(
    session_factory: Any,
    actor: str,
    channel_id: str,
    *,
    slug: str | None = None,
    name: str | None = None,
    edition_id: str | None = None,
    active: bool | None = None,
) -> dict:
    provided = _given(slug=slug, name=name, edition_id=edition_id, active=active)
    return await _update(session_factory, actor, "channels", ChannelWrite, ChannelOut, channel_id, provided)


async def delete_signage_channel(session_factory: Any, actor: str, channel_id: str) -> dict:
    return await _delete(session_factory, actor, "channels", channel_id)


# -- Templates --------------------------------------------------------------


async def list_signage_templates(session_factory: Any) -> dict:
    return {"templates": await _list(session_factory, "templates", TemplateOut)}


async def get_signage_template(session_factory: Any, template_id: str) -> dict:
    return await _get(session_factory, "templates", TemplateOut, template_id)


async def create_signage_template(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    background: dict[str, Any] | None = None,
    layers: list[dict[str, Any]] | None = None,
) -> dict:
    return await _create(
        session_factory,
        actor,
        "templates",
        TemplateWrite,
        TemplateOut,
        **_given(name=name, background=background, layers=layers),
    )


async def update_signage_template(
    session_factory: Any,
    actor: str,
    template_id: str,
    *,
    name: str | None = None,
    background: dict[str, Any] | None = None,
    layers: list[dict[str, Any]] | None = None,
) -> dict:
    provided = _given(name=name, background=background, layers=layers)
    return await _update(session_factory, actor, "templates", TemplateWrite, TemplateOut, template_id, provided)


async def delete_signage_template(session_factory: Any, actor: str, template_id: str) -> dict:
    return await _delete(session_factory, actor, "templates", template_id)


# -- Slides -----------------------------------------------------------------


async def list_signage_slides(session_factory: Any) -> dict:
    return {"slides": await _list(session_factory, "slides", SlideOut)}


async def get_signage_slide(session_factory: Any, slide_id: str) -> dict:
    return await _get(session_factory, "slides", SlideOut, slide_id)


async def create_signage_slide(
    session_factory: Any,
    actor: str,
    *,
    channel_id: str,
    template_id: str,
    kind: SlideKind,
    duration: int = 10,
    active: bool = False,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    content: dict[str, Any] | None = None,
) -> dict:
    return await _create(
        session_factory,
        actor,
        "slides",
        SlideWrite,
        SlideOut,
        **_given(
            channel_id=channel_id,
            template_id=template_id,
            kind=kind,
            duration=duration,
            active=active,
            starts_at=starts_at,
            ends_at=ends_at,
            content=content,
        ),
    )


async def update_signage_slide(
    session_factory: Any,
    actor: str,
    slide_id: str,
    *,
    channel_id: str | None = None,
    template_id: str | None = None,
    kind: SlideKind | None = None,
    duration: int | None = None,
    active: bool | None = None,
    starts_at: datetime | None = None,
    clear_starts_at: bool = False,
    ends_at: datetime | None = None,
    clear_ends_at: bool = False,
    content: dict[str, Any] | None = None,
) -> dict:
    """Update a slide. ``clear_starts_at`` / ``clear_ends_at`` remove that end of its schedule window."""
    provided = _given(
        channel_id=channel_id,
        template_id=template_id,
        kind=kind,
        duration=duration,
        active=active,
        starts_at=starts_at,
        ends_at=ends_at,
        content=content,
    )
    if clear_starts_at:
        provided["starts_at"] = None
    if clear_ends_at:
        provided["ends_at"] = None
    return await _update(session_factory, actor, "slides", SlideWrite, SlideOut, slide_id, provided)


async def delete_signage_slide(session_factory: Any, actor: str, slide_id: str) -> dict:
    return await _delete(session_factory, actor, "slides", slide_id)


async def reorder_signage_slides(session_factory: Any, actor: str, channel_id: str, *, ordered_ids: list[str]) -> dict:
    """Reassign the display order of a channel's slides; ``ordered_ids`` names each exactly once."""
    body = validate_with_schema(Reorder, ordered_ids=ordered_ids)
    async with session_factory() as db:
        try:
            slides = await service.reorder(db, channel_id, body.ordered_ids, actor, None)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return {"slides": [_dump(SlideOut, slide) for slide in slides]}


# -- Playlists --------------------------------------------------------------


async def get_signage_playlist(session_factory: Any, channel_slug: str, *, locale: FaqLocale = "nl") -> dict:
    """The playlist a display of an active channel receives right now, in ``locale``."""
    async with session_factory() as db:
        try:
            return (await service.playlist(db, channel_slug, locale)).model_dump(mode="json")
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def preview_signage_playlist(
    session_factory: Any,
    *,
    channel: dict[str, Any],
    slides: list[dict[str, Any]],
    at: datetime,
    locale: FaqLocale = "nl",
) -> dict:
    """The playlist these unsaved ``channel`` and ``slides`` would produce at time ``at``."""
    body = validate_with_schema(PlaylistPreview, channel=channel, slides=slides, at=at)
    async with session_factory() as db:
        try:
            return (await service.playlist(db, "", locale, body.at, preview=body)).model_dump(mode="json")
        except HTTPException as exc:
            raise as_value_error(exc) from exc
