"""Shared application-service operations for FAQ items.

Used by both ``app.routers.faq`` (REST) and ``app.mcp.admin.faq`` (MCP). See
``app/services/rooms_service.py`` for the pattern this follows and
``app/services/errors.py`` for the exception convention each adapter
translates at its own boundary.

``sort_order`` is enforced unique by a deferrable constraint (migration 012)
so display order is always deterministic. It isn't client-settable through
create/update — ``create_faq_item`` always appends after the current last
item, and ``reorder_faq_items`` is the only supported way to change existing
positions, taking the complete ordered list at once so a reorder can't be
partial, stale, or racing another admin's reorder (#836).
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import FaqItem
from app.schemas import FaqItemCreate, FaqItemUpdate
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.utils import faq_item_to_dict, make_id

# A concurrent create can race this one for the same next `sort_order`; the
# unique constraint (checked at commit) catches that, and this bounds how
# many times we recompute-and-retry before giving up.
_MAX_APPEND_ATTEMPTS = 5


async def list_faq_items(db: AsyncSession) -> list[dict]:
    """Every FAQ item and every locale, active or not, in display order (admin shape)."""
    result = await db.execute(select(FaqItem).order_by(FaqItem.sort_order))
    return [faq_item_to_dict(f) for f in result.scalars().all()]


async def create_faq_item(db: AsyncSession, *, actor: str, body: FaqItemCreate, request_id: str | None = None) -> dict:
    for _attempt in range(_MAX_APPEND_ATTEMPTS):
        current_max = (await db.execute(select(func.max(FaqItem.sort_order)))).scalar_one()
        f = FaqItem(
            id=make_id("faq"),
            question_nl=body.question_nl,
            answer_nl=body.answer_nl,
            question_en=body.question_en or None,
            answer_en=body.answer_en or None,
            question_fr=body.question_fr or None,
            answer_fr=body.answer_fr or None,
            sort_order=0 if current_max is None else current_max + 1,
            active=body.active,
        )
        db.add(f)
        await write_audit_entry(
            db,
            actor=actor,
            action="faq_item_created",
            resource_type="faq_item",
            resource_id=f.id,
            request_id=request_id,
            details={"question_nl": f.question_nl},
        )
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            continue
        await db.refresh(f)
        return faq_item_to_dict(f)
    raise ConflictError("Could not assign a unique display position for the new FAQ item; please retry.")


async def update_faq_item(
    db: AsyncSession, *, actor: str, faq_item_id: str, body: FaqItemUpdate, request_id: str | None = None
) -> dict:
    f = await db.get(FaqItem, faq_item_id)
    if f is None:
        raise NotFoundError(f"FAQ item '{faq_item_id}' not found.")
    if body.question_nl is not None:
        f.question_nl = body.question_nl
    if body.answer_nl is not None:
        f.answer_nl = body.answer_nl
    # Optional locales: presence, not None-ness, distinguishes "omitted" from
    # "sent as '', clear it" — an empty string normalizes to NULL, hiding the
    # item on that locale's FAQ.
    fields_set = body.model_fields_set
    if "question_en" in fields_set:
        f.question_en = body.question_en or None
    if "answer_en" in fields_set:
        f.answer_en = body.answer_en or None
    if "question_fr" in fields_set:
        f.question_fr = body.question_fr or None
    if "answer_fr" in fields_set:
        f.answer_fr = body.answer_fr or None
    if body.active is not None:
        f.active = body.active
    await write_audit_entry(
        db,
        actor=actor,
        action="faq_item_updated",
        resource_type="faq_item",
        resource_id=f.id,
        request_id=request_id,
        details={"fields_changed": sorted(fields_set)},
    )
    await db.commit()
    await db.refresh(f)
    return faq_item_to_dict(f)


async def delete_faq_item(db: AsyncSession, *, actor: str, faq_item_id: str, request_id: str | None = None) -> dict:
    f = await db.get(FaqItem, faq_item_id)
    if f is None:
        raise NotFoundError(f"FAQ item '{faq_item_id}' not found.")
    await db.delete(f)
    await write_audit_entry(
        db,
        actor=actor,
        action="faq_item_deleted",
        resource_type="faq_item",
        resource_id=faq_item_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "id": faq_item_id}


async def reorder_faq_items(
    db: AsyncSession, *, actor: str, ordered_ids: list[str], request_id: str | None = None
) -> list[dict]:
    """Atomically reassign ``sort_order`` (0..N-1) to match ``ordered_ids``.

    ``ordered_ids`` must name every existing FAQ item exactly once. A partial
    or stale list — e.g. an item created or deleted by someone else since the
    caller loaded its copy of the list — is rejected outright rather than
    silently reordering a subset, which is what keeps concurrent reorders
    well-defined: the loser of a race gets a 409 and has to reload, not a
    merged/ambiguous result.
    """
    if len(ordered_ids) != len(set(ordered_ids)):
        raise ValidationFailedError("ordered_ids contains duplicates.")

    # Lock every row up front so a second reorder (or a create/delete) can't
    # interleave with this one — it blocks until we commit, then its own
    # existing-ids check below almost certainly fails against our new state.
    result = await db.execute(select(FaqItem).order_by(FaqItem.sort_order).with_for_update())
    items = {f.id: f for f in result.scalars().all()}
    if set(ordered_ids) != set(items):
        raise ConflictError(
            "ordered_ids must name every existing FAQ item exactly once; the list is stale — reload and retry."
        )

    for index, item_id in enumerate(ordered_ids):
        items[item_id].sort_order = index

    await write_audit_entry(
        db,
        actor=actor,
        action="faq_items_reordered",
        resource_type="faq_item",
        resource_id="faq_items",
        request_id=request_id,
        details={"ordered_ids": ordered_ids},
    )
    await db.commit()
    return await list_faq_items(db)
