"""Signage transactions and privacy-reviewed playlist projection."""

import hashlib
from datetime import UTC, datetime
from typing import NoReturn

from pydantic import BaseModel
from sqlalchemy import or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Area, Edition, Event, Layout, Organization, SignageChannel, SignageSlide, SignageTemplate
from app.services.edition_artwork import public_root
from app.services.errors import ApiHTTPException
from app.signage_schemas import Content, DisplayTemplate, Playlist, PlaylistPreview, PublicSlide, missing_bindings
from app.utils import make_id

MODELS = {"channels": SignageChannel, "templates": SignageTemplate, "slides": SignageSlide}


def fail(status: int, code: str, detail: str) -> NoReturn:
    raise ApiHTTPException(status, code, detail)


async def lock(db: AsyncSession):
    # Serializes signage mutations including reorder and shared-template edits.
    await db.execute(text("SELECT pg_advisory_xact_lock(1261)"))


async def get(db: AsyncSession, resource: str, item_id: str):
    item = await db.get(MODELS[resource], item_id)
    if item is None:
        fail(404, "signage_not_found", "Signage resource not found.")
    return item


async def list_all(db: AsyncSession, resource: str):
    model = MODELS[resource]
    return list((await db.scalars(select(model).order_by(model.id))).all())


def validate_assets(document):
    """Only references to validated uploads in shared storage may be published."""
    if isinstance(document, dict):
        for key, value in document.items():
            if key == "image" and value:
                path = public_root() / "signage" / value.rsplit("/", 1)[-1]
                if not path.is_file() or path.is_symlink():
                    fail(400, "signage_asset_not_found", "Upload the image before referencing it.")
            else:
                validate_assets(value)
    elif isinstance(document, list):
        for value in document:
            validate_assets(value)


async def touch_channels(db: AsyncSession, resource: str, item, previous_channel_id: str | None = None):
    """Advance edit metadata only on channels affected by this mutation."""
    if resource == "channels":
        ids = [item.id]
    elif resource == "slides":
        ids = [item.channel_id, previous_channel_id or item.channel_id]
    else:
        ids = select(SignageSlide.channel_id).where(SignageSlide.template_id == item.id)
    with db.no_autoflush:
        channels = list(await db.scalars(select(SignageChannel).where(SignageChannel.id.in_(ids))))
    for channel in channels:
        channel.revision += 1


async def save(db: AsyncSession, resource: str, body: BaseModel, actor: str, request_id: str | None, item_id=None):
    await lock(db)
    validate_assets(body.model_dump(mode="json"))
    data = body.model_dump(mode="python")
    if "content" in data:
        data["content"] = body.model_dump(mode="json")["content"]
    if resource == "channels" and not await db.get(Edition, data["edition_id"]):
        fail(404, "signage_edition_not_found", "Edition not found.")
    if resource == "slides":
        await get(db, "channels", data["channel_id"])
        template = await get(db, "templates", data["template_id"])
        if missing_bindings(template.layers, data["kind"]):
            fail(422, "signage_missing_placeholders", "Template is missing required visible placeholders.")
    if resource == "templates" and item_id:
        kinds = await db.scalars(select(SignageSlide.kind).where(SignageSlide.template_id == item_id))
        if any(missing_bindings(data["layers"], kind) for kind in kinds):
            fail(422, "signage_missing_placeholders", "Template is missing placeholders required by existing slides.")
    item = await get(db, resource, item_id) if item_id else MODELS[resource](id=make_id("sig"))
    previous_channel_id = item.channel_id if isinstance(item, SignageSlide) and item_id else None
    for key, value in data.items():
        setattr(item, key, value)
    db.add(item)
    await touch_channels(db, resource, item, previous_channel_id)
    await write_audit_entry(
        db,
        actor=actor,
        action="update" if item_id else "create",
        resource_type=f"signage_{resource}",
        resource_id=item.id,
        request_id=request_id,
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiHTTPException(409, "signage_conflict", "Slug already exists or reference is in use.") from exc
    await db.refresh(item)
    return item


async def delete(db: AsyncSession, resource: str, item_id: str, actor: str, request_id: str | None):
    await lock(db)
    item = await get(db, resource, item_id)
    await touch_channels(db, resource, item)
    await db.delete(item)
    await write_audit_entry(
        db,
        actor=actor,
        action="delete",
        resource_type=f"signage_{resource}",
        resource_id=item_id,
        request_id=request_id,
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiHTTPException(409, "signage_in_use", "Template is still in use.") from exc


async def reorder(db: AsyncSession, channel_id: str, ids: list[str], actor: str, request_id: str | None):
    await lock(db)
    channel = await get(db, "channels", channel_id)
    slides = list((await db.scalars(select(SignageSlide).where(SignageSlide.channel_id == channel_id))).all())
    if len(set(ids)) != len(ids) or set(ids) != {slide.id for slide in slides}:
        fail(400, "signage_invalid_order", "Supply every slide in this channel exactly once.")
    positions = {item_id: index for index, item_id in enumerate(ids)}
    for slide in slides:
        slide.sort_order = positions[slide.id]
    channel.revision += 1
    await write_audit_entry(
        db, actor=actor, action="reorder", resource_type="signage_slides", resource_id=channel_id, request_id=request_id
    )
    await db.commit()
    return sorted(slides, key=lambda slide: slide.sort_order)


def localized(content: Content, field: str, locale: str):
    return getattr(content, f"{field}_{locale}") or getattr(content, f"{field}_{content.text_language}")


async def playlist(
    db: AsyncSession,
    slug: str,
    locale: str,
    now: datetime | None = None,
    *,
    preview: PlaylistPreview | None = None,
    export_limits: tuple[int, int] | None = None,
) -> Playlist:
    now = now or datetime.now(UTC)
    channel = (
        SignageChannel(id="preview", epoch=now, **preview.channel.model_dump())
        if preview
        else await db.scalar(select(SignageChannel).where(SignageChannel.slug == slug, SignageChannel.active.is_(True)))
    )
    if channel is None:
        fail(404, "signage_not_found", "Channel not found.")
    edition = await db.get(Edition, channel.edition_id)
    if edition is None:
        fail(404, "signage_edition_not_found", "Edition not found.")
    organizations = list(
        (
            await db.scalars(
                select(Organization).where(
                    or_(
                        Organization.id.in_(edition.organizations),
                        (Organization.type == "vendor")
                        & Organization.id.in_(
                            select(Area.organization_id)
                            .join(Layout, Area.layout_id == Layout.id)
                            .join(Event, Layout.event_id == Event.id)
                            .where(Event.edition_id == edition.id, Event.active.is_(True))
                        ),
                    ),
                    Organization.active.is_(True),
                )
            )
        ).all()
    )
    lineup = {oid: index for index, oid in enumerate(edition.organizations)}
    tiers = {"main": 0, "partner": 1, "supporter": 2}
    organizations.sort(
        key=lambda org: (
            {"producer": 0, "vendor": 1, "sponsor": 2}.get(org.type, 3),
            tiers.get(edition.sponsor_tiers.get(str(org.id)), 3) if org.type == "sponsor" else 0,
            org.name.casefold() if org.type in ("producer", "vendor") else "",
            lineup.get(org.id, org.id),
        )
    )
    rows = (
        await db.execute(
            select(SignageSlide, SignageTemplate)
            .join(SignageTemplate, SignageSlide.template_id == SignageTemplate.id)
            .where(SignageSlide.channel_id == channel.id, SignageSlide.active.is_(True))
            .order_by(SignageSlide.sort_order, SignageSlide.id)
        )
    ).all()
    if preview:
        rows = []
        for index, draft in enumerate(preview.slides):
            template = await get(db, "templates", draft.template_id)
            if missing_bindings(template.layers, draft.kind):
                fail(422, "signage_missing_placeholders", "Template is missing required visible placeholders.")
            validate_assets(draft.model_dump(mode="json"))
            slide = SignageSlide(id=f"preview-{index}", **draft.model_dump(mode="python"))
            if slide.active:
                rows.append((slide, template))
        rows.sort(key=lambda row: (row[0].sort_order, row[0].id))
    slides = []
    cycle_seconds = 0

    def append_slide(item: PublicSlide):
        nonlocal cycle_seconds
        cycle_seconds += item.duration
        # Abort expansion before allocating an excessive frozen video manifest.
        # Public/live and draft preview callers do not opt into export limits.
        if export_limits and (len(slides) >= export_limits[0] or cycle_seconds > export_limits[1]):
            fail(422, "signage_video_playlist_limit", "Playlist exceeds video export limits.")
        slides.append(item)

    for slide, template in rows:
        if slide.starts_at and now < slide.starts_at or slide.ends_at and now >= slide.ends_at:
            continue
        public_template = DisplayTemplate.model_validate(template)
        if slide.kind == "organizations":
            for org in organizations:
                selected_type = slide.content.get("organization_type")
                if org.type not in ("producer", "vendor", "sponsor") or selected_type and org.type != selected_type:
                    continue
                description = getattr(org, f"description_{locale}") or (
                    getattr(org, f"description_{org.description_language}") if org.description_language else None
                )
                append_slide(
                    PublicSlide(
                        id=f"{slide.id}:{org.id}",
                        kind="organization",
                        duration=slide.duration,
                        template=public_template,
                        organization={
                            "name": org.name,
                            "logo": org.image,
                            "description": description,
                            "sponsor": org.type == "sponsor",
                            "sponsor_tier": edition.sponsor_tiers.get(str(org.id)) if org.type == "sponsor" else None,
                        },
                    )
                )
        else:
            content = Content.model_validate(slide.content)
            append_slide(
                PublicSlide(
                    id=slide.id,
                    kind="notice" if slide.kind == "notice" else "image",
                    duration=slide.duration,
                    template=public_template,
                    text=localized(content, "text", locale),
                    title=localized(content, "title", locale),
                    translations=content,
                    image=content.image,
                    icon=content.icon,
                )
            )
    result = Playlist(revision="", epoch=channel.epoch, slides=slides)
    boundaries = [
        (boundary - now).total_seconds()
        for slide, _ in rows
        for boundary in (slide.starts_at, slide.ends_at)
        if boundary is not None and boundary > now
    ]
    result._max_age = max(0, min(5, int(min(boundaries)))) if boundaries else 5
    result.revision = hashlib.sha256(result.model_dump_json().encode()).hexdigest()
    return result
