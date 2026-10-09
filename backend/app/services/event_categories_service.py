"""Shared application-service operations for event categories (#1222).

Used by both ``app.routers.event_categories`` (REST) and
``app.mcp.admin.event_categories`` (MCP); see ``app/services/errors.py`` for
how each adapter translates the raised ``ServiceError``.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Event, EventCategory
from app.schemas import EventCategoryCreate, EventCategoryLabels, EventCategoryUpdate
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError

LABEL_FIELDS = ("label_language", "label_nl", "label_fr", "label_en")


def category_to_dict(category: EventCategory, locale: str | None = None) -> dict:
    return {
        "key": category.key,
        "label": category.localized_label(locale),
        "label_language": category.label_language,
        "label_nl": category.label_nl,
        "label_fr": category.label_fr,
        "label_en": category.label_en,
        "sort_order": category.sort_order,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    }


async def list_categories(db: AsyncSession, *, locale: str | None = None) -> list[dict]:
    result = await db.execute(select(EventCategory).order_by(EventCategory.sort_order, EventCategory.key))
    return [category_to_dict(category, locale) for category in result.scalars().all()]


async def _get_locked(db: AsyncSession, key: str) -> EventCategory:
    category = (
        await db.execute(select(EventCategory).where(EventCategory.key == key).with_for_update())
    ).scalar_one_or_none()
    if category is None:
        raise NotFoundError(f"Event category '{key}' not found.")
    return category


async def create_category(
    db: AsyncSession, *, actor: str, body: EventCategoryCreate, request_id: str | None = None
) -> dict:
    if await db.get(EventCategory, body.key) is not None:
        raise ConflictError(f"Event category '{body.key}' already exists.")
    category = EventCategory(
        key=body.key,
        sort_order=body.sort_order,
        **body.model_dump(include=set(LABEL_FIELDS)),
    )
    db.add(category)
    await write_audit_entry(
        db,
        actor=actor,
        action="event_category_created",
        resource_type="event_category",
        resource_id=category.key,
        request_id=request_id,
        details={"label_language": category.label_language},
    )
    await db.commit()
    await db.refresh(category)
    return category_to_dict(category)


async def update_category(
    db: AsyncSession, *, actor: str, key: str, body: EventCategoryUpdate, request_id: str | None = None
) -> dict:
    category = await _get_locked(db, key)
    # Validate the merged labels before mutating: a partial update may change a single translation.
    labels = {field: getattr(category, field) for field in LABEL_FIELDS}
    labels.update(body.model_dump(include=set(LABEL_FIELDS), exclude_unset=True))
    try:
        validated = EventCategoryLabels.model_validate(labels).validate_original()
    except ValueError as exc:
        raise ValidationFailedError(str(exc)) from exc
    for field in LABEL_FIELDS:
        setattr(category, field, getattr(validated, field))
    if body.sort_order is not None:
        category.sort_order = body.sort_order
    await write_audit_entry(
        db,
        actor=actor,
        action="event_category_updated",
        resource_type="event_category",
        resource_id=key,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(category)
    return category_to_dict(category)


async def delete_category(db: AsyncSession, *, actor: str, key: str, request_id: str | None = None) -> dict:
    category = await _get_locked(db, key)
    in_use = (await db.execute(select(func.count()).select_from(Event).where(Event.category == key))).scalar_one()
    if in_use:
        raise ConflictError(
            f"Cannot delete event category '{key}': {in_use} event(s) still use it. Move them to another category first."
        )
    await db.delete(category)
    await write_audit_entry(
        db,
        actor=actor,
        action="event_category_deleted",
        resource_type="event_category",
        resource_id=key,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "key": key}
