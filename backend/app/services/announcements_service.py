"""Transactional announcement management shared by API adapters."""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Announcement
from app.schemas import AnnouncementCreate, AnnouncementUpdate
from app.services.errors import NotFoundError, ValidationFailedError
from app.utils import make_id


def to_dict(item: Announcement) -> dict:
    return {
        name: getattr(item, name)
        for name in (
            "id",
            "text_nl",
            "text_en",
            "text_fr",
            "level",
            "active",
            "sort_order",
            "starts_at",
            "ends_at",
            "link_url",
            "link_label_nl",
            "link_label_en",
            "link_label_fr",
            "published_at",
            "published_by",
            "created_at",
            "updated_at",
        )
    }


async def list_all(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(Announcement).order_by(Announcement.sort_order))
    return [to_dict(item) for item in result.scalars()]


async def create(db: AsyncSession, *, actor: str, body: AnnouncementCreate, request_id: str | None) -> dict:
    # Serialize the short max-plus-one allocation. Without this transaction-level
    # lock, two valid concurrent creates can choose the same sort_order and one
    # leaks the deferred unique-constraint failure at commit.
    await db.execute(select(func.pg_advisory_xact_lock(945)))
    maximum = (await db.execute(select(func.max(Announcement.sort_order)))).scalar_one()
    values = body.model_dump()
    values.update(id=make_id("ann"), sort_order=0 if maximum is None else maximum + 1)
    item = Announcement(**values)
    if item.active:
        item.published_at, item.published_by = datetime.now(UTC), actor
    db.add(item)
    await write_audit_entry(
        db,
        actor=actor,
        action="announcement_created",
        resource_type="announcement",
        resource_id=item.id,
        request_id=request_id,
        details={"active": item.active},
    )
    if item.active:
        await write_audit_entry(
            db,
            actor=actor,
            action="announcement_published",
            resource_type="announcement",
            resource_id=item.id,
            request_id=request_id,
        )
    await db.commit()
    await db.refresh(item)
    return to_dict(item)


async def update(
    db: AsyncSession, *, actor: str, item_id: str, body: AnnouncementUpdate, request_id: str | None
) -> dict:
    item = await db.get(Announcement, item_id)
    if item is None:
        raise NotFoundError(f"Announcement '{item_id}' not found.")
    was_active = item.active
    for name, value in body.model_dump(include=body.model_fields_set).items():
        setattr(item, name, value or None if name.startswith(("text_", "link_")) else value)
    if item.starts_at and item.ends_at and item.ends_at <= item.starts_at:
        raise ValidationFailedError("ends_at must be later than starts_at.")
    if item.link_url and not any((item.link_label_nl, item.link_label_en, item.link_label_fr)):
        raise ValidationFailedError("A link URL requires at least one translated link label.")
    if item.active and not any((item.text_nl, item.text_en, item.text_fr)):
        raise ValidationFailedError("An active announcement needs at least one translation.")
    await write_audit_entry(
        db,
        actor=actor,
        action="announcement_updated",
        resource_type="announcement",
        resource_id=item.id,
        request_id=request_id,
    )
    if item.active != was_active:
        action = "announcement_published" if item.active else "announcement_unpublished"
        if item.active:
            item.published_at, item.published_by = datetime.now(UTC), actor
        await write_audit_entry(
            db,
            actor=actor,
            action=action,
            resource_type="announcement",
            resource_id=item.id,
            request_id=request_id,
        )
    await db.commit()
    await db.refresh(item)
    return to_dict(item)


async def reorder(db: AsyncSession, *, actor: str, ordered_ids: list[str], request_id: str | None) -> list[dict]:
    result = await db.execute(select(Announcement).with_for_update())
    items = list(result.scalars())
    if len(set(ordered_ids)) != len(ordered_ids) or set(ordered_ids) != {item.id for item in items}:
        raise ValidationFailedError("ordered_ids must contain every announcement ID exactly once.")
    by_id = {item.id: item for item in items}
    for position, item_id in enumerate(ordered_ids):
        by_id[item_id].sort_order = position
    await write_audit_entry(
        db,
        actor=actor,
        action="announcements_reordered",
        resource_type="announcement",
        resource_id="collection",
        request_id=request_id,
        details={"ordered_ids": ordered_ids},
    )
    await db.commit()
    return [to_dict(by_id[item_id]) for item_id in ordered_ids]


async def delete(db: AsyncSession, *, actor: str, item_id: str, request_id: str | None) -> None:
    item = await db.get(Announcement, item_id)
    if item is None:
        raise NotFoundError(f"Announcement '{item_id}' not found.")
    await db.delete(item)
    await write_audit_entry(
        db,
        actor=actor,
        action="announcement_deleted",
        resource_type="announcement",
        resource_id=item_id,
        request_id=request_id,
    )
    await db.commit()
