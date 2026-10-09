"""Shared operations for the admin-managed category tables (#1222).

Event categories and product categories have the same shape — a stable key plus a
label per language — so ``event_categories_service`` and
``product_categories_service`` are thin bindings of a :class:`CategoryKind` to
these functions. See ``app/services/errors.py`` for how each adapter translates
the raised ``ServiceError``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.audit import write_audit_entry
from app.models import EventCategory, ProductCategory
from app.schemas import CategoryCreate, CategoryLabels, CategoryUpdate
from app.services.errors import ConflictError, NotFoundError, ServiceError, ValidationFailedError

LABEL_FIELDS = ("label_language", "label_nl", "label_fr", "label_en")


@dataclass(frozen=True)
class CategoryKind:
    """What differs between category tables."""

    noun: str
    """"event" or "product": used in messages, audit actions and resource types."""
    model: type[EventCategory] | type[ProductCategory]
    used_by: InstrumentedAttribute
    """The column holding a category key, e.g. ``Event.category``."""
    protected: dict[str, str] = field(default_factory=dict)
    """Keys that cannot be deleted, with the reason (code depends on them)."""


def category_to_dict(category: EventCategory | ProductCategory, locale: str | None = None) -> dict:
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


async def list_categories(db: AsyncSession, kind: CategoryKind, *, locale: str | None = None) -> list[dict]:
    result = await db.execute(select(kind.model).order_by(kind.model.sort_order, kind.model.key))
    return [category_to_dict(category, locale) for category in result.scalars().all()]


async def ensure_category_exists(db: AsyncSession, kind: CategoryKind, key: str) -> None:
    if await db.get(kind.model, key) is None:
        raise ServiceError(
            f"Unknown {kind.noun} category '{key}'. Use an existing category key (see /api/{kind.noun}-categories).",
            status_code=422,
        )


async def _get_locked(db: AsyncSession, kind: CategoryKind, key: str):
    category = (
        await db.execute(select(kind.model).where(kind.model.key == key).with_for_update())
    ).scalar_one_or_none()
    if category is None:
        raise NotFoundError(f"{kind.noun.capitalize()} category '{key}' not found.")
    return category


async def create_category(
    db: AsyncSession, kind: CategoryKind, *, actor: str, body: CategoryCreate, request_id: str | None = None
) -> dict:
    if await db.get(kind.model, body.key) is not None:
        raise ConflictError(f"{kind.noun.capitalize()} category '{body.key}' already exists.")
    category = kind.model(
        key=body.key,
        sort_order=body.sort_order,
        **body.model_dump(include=set(LABEL_FIELDS)),
    )
    db.add(category)
    await write_audit_entry(
        db,
        actor=actor,
        action=f"{kind.noun}_category_created",
        resource_type=f"{kind.noun}_category",
        resource_id=category.key,
        request_id=request_id,
        details={"label_language": category.label_language},
    )
    await db.commit()
    await db.refresh(category)
    return category_to_dict(category)


async def update_category(
    db: AsyncSession,
    kind: CategoryKind,
    *,
    actor: str,
    key: str,
    body: CategoryUpdate,
    request_id: str | None = None,
) -> dict:
    category = await _get_locked(db, kind, key)
    # Validate the merged labels before mutating: a partial update may change a single translation.
    labels = {name: getattr(category, name) for name in LABEL_FIELDS}
    labels.update(body.model_dump(include=set(LABEL_FIELDS), exclude_unset=True))
    try:
        validated = CategoryLabels.model_validate(labels).validate_original()
    except ValueError as exc:
        raise ValidationFailedError(str(exc)) from exc
    for name in LABEL_FIELDS:
        setattr(category, name, getattr(validated, name))
    if body.sort_order is not None:
        category.sort_order = body.sort_order
    await write_audit_entry(
        db,
        actor=actor,
        action=f"{kind.noun}_category_updated",
        resource_type=f"{kind.noun}_category",
        resource_id=key,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(category)
    return category_to_dict(category)


async def delete_category(
    db: AsyncSession, kind: CategoryKind, *, actor: str, key: str, request_id: str | None = None
) -> dict:
    category = await _get_locked(db, kind, key)
    if key in kind.protected:
        raise ConflictError(f"Cannot delete {kind.noun} category '{key}': {kind.protected[key]}")
    in_use = (
        await db.execute(select(func.count()).select_from(kind.used_by.class_).where(kind.used_by == key))
    ).scalar_one()
    if in_use:
        raise ConflictError(
            f"Cannot delete {kind.noun} category '{key}': {in_use} {kind.noun}(s) still use it. "
            "Move them to another category first."
        )
    await db.delete(category)
    await write_audit_entry(
        db,
        actor=actor,
        action=f"{kind.noun}_category_deleted",
        resource_type=f"{kind.noun}_category",
        resource_id=key,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "key": key}
