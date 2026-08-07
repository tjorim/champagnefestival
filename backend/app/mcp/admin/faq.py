"""Admin (write) MCP tool implementations for FAQ item management.

Mirrors ``app.routers.faq``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.audit import write_audit_entry
from app.mcp.utils import get_or_error, validate_with_schema
from app.models import FaqItem
from app.schemas import FaqItemCreate, FaqItemUpdate
from app.utils import faq_item_to_dict, make_id


async def create_faq_item(
    session_factory: Any,
    actor: str,
    *,
    question_nl: str,
    answer_nl: str,
    question_en: str | None = None,
    answer_en: str | None = None,
    question_fr: str | None = None,
    answer_fr: str | None = None,
    sort_order: int = 0,
    active: bool = True,
) -> dict:
    body = validate_with_schema(
        FaqItemCreate,
        question_nl=question_nl,
        answer_nl=answer_nl,
        question_en=question_en or None,
        answer_en=answer_en or None,
        question_fr=question_fr or None,
        answer_fr=answer_fr or None,
        sort_order=sort_order,
        active=active,
    )
    async with session_factory() as db:
        f = FaqItem(
            id=make_id("faq"),
            question_nl=body.question_nl,
            answer_nl=body.answer_nl,
            question_en=body.question_en,
            answer_en=body.answer_en,
            question_fr=body.question_fr,
            answer_fr=body.answer_fr,
            sort_order=body.sort_order,
            active=body.active,
        )
        db.add(f)
        await write_audit_entry(
            db,
            actor=actor,
            action="faq_item_created",
            resource_type="faq_item",
            resource_id=f.id,
            details={"question_nl": f.question_nl},
        )
        await db.commit()
        await db.refresh(f)
        return faq_item_to_dict(f)


async def list_faq_items(session_factory: Any) -> dict:
    """Every FAQ item and every locale, active or not, in display order (admin shape)."""
    async with session_factory() as db:
        result = await db.execute(select(FaqItem).order_by(FaqItem.sort_order))
        return {"faq_items": [faq_item_to_dict(f) for f in result.scalars().all()]}


async def update_faq_item(
    session_factory: Any,
    actor: str,
    faq_item_id: str,
    *,
    question_nl: str | None = None,
    answer_nl: str | None = None,
    question_en: str | None = None,
    answer_en: str | None = None,
    question_fr: str | None = None,
    answer_fr: str | None = None,
    sort_order: int | None = None,
    active: bool | None = None,
) -> dict:
    """Update an FAQ item.

    ``question_en``/``answer_en``/``question_fr``/``answer_fr`` follow the
    module-level convention: omitted (``None``) leaves the locale untouched;
    an explicit empty string clears it, hiding the item on that locale's FAQ.
    """
    provided = {
        k: v
        for k, v in {
            "question_nl": question_nl,
            "answer_nl": answer_nl,
            "question_en": question_en,
            "answer_en": answer_en,
            "question_fr": question_fr,
            "answer_fr": answer_fr,
            "sort_order": sort_order,
            "active": active,
        }.items()
        if v is not None
    }
    validate_with_schema(FaqItemUpdate, **provided)
    async with session_factory() as db:
        f = await get_or_error(db, FaqItem, faq_item_id, f"FAQ item '{faq_item_id}' not found.")
        fields_changed: list[str] = []
        if question_nl is not None:
            f.question_nl = question_nl
            fields_changed.append("question_nl")
        if answer_nl is not None:
            f.answer_nl = answer_nl
            fields_changed.append("answer_nl")
        if question_en is not None:
            f.question_en = question_en or None
            fields_changed.append("question_en")
        if answer_en is not None:
            f.answer_en = answer_en or None
            fields_changed.append("answer_en")
        if question_fr is not None:
            f.question_fr = question_fr or None
            fields_changed.append("question_fr")
        if answer_fr is not None:
            f.answer_fr = answer_fr or None
            fields_changed.append("answer_fr")
        if sort_order is not None:
            f.sort_order = sort_order
            fields_changed.append("sort_order")
        if active is not None:
            f.active = active
            fields_changed.append("active")
        await write_audit_entry(
            db,
            actor=actor,
            action="faq_item_updated",
            resource_type="faq_item",
            resource_id=f.id,
            details={"fields_changed": sorted(fields_changed)},
        )
        await db.commit()
        await db.refresh(f)
        return faq_item_to_dict(f)


async def delete_faq_item(session_factory: Any, actor: str, faq_item_id: str) -> dict:
    async with session_factory() as db:
        f = await get_or_error(db, FaqItem, faq_item_id, f"FAQ item '{faq_item_id}' not found.")
        await db.delete(f)
        await write_audit_entry(
            db,
            actor=actor,
            action="faq_item_deleted",
            resource_type="faq_item",
            resource_id=faq_item_id,
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": faq_item_id}
