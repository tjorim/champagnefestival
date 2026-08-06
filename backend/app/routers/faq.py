"""FAQ item management endpoints."""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import FaqItem
from app.schemas import FaqItemCreate, FaqItemOut, FaqItemPublicOut, FaqItemUpdate, FaqLocale
from app.utils import faq_item_to_dict, faq_item_to_public_dict, get_or_404, make_id

router = APIRouter(
    prefix="/api/faq",
    tags=["faq"],
)


@router.get("/active", response_model=list[FaqItemPublicOut])
async def list_active_faq_items(
    locale: FaqLocale = Query(default="nl"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Public: active FAQ items with a translation for `locale`, in display order.

    An item with a blank translation for this locale is omitted rather than
    falling back to another language's text.
    """
    question_column = getattr(FaqItem, f"question_{locale}")
    answer_column = getattr(FaqItem, f"answer_{locale}")
    stmt = (
        select(FaqItem)
        .where(FaqItem.active.is_(True), question_column.isnot(None), answer_column.isnot(None))
        .order_by(FaqItem.sort_order)
    )
    result = await db.execute(stmt)
    items = [faq_item_to_public_dict(f, locale) for f in result.scalars().all()]
    return [item for item in items if item is not None]


@router.get("", response_model=list[FaqItemOut], dependencies=[Depends(require_admin)])
async def list_faq_items(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Admin: every FAQ item and every locale, active or not, in display order."""
    stmt = select(FaqItem).order_by(FaqItem.sort_order)
    result = await db.execute(stmt)
    return [faq_item_to_dict(f) for f in result.scalars().all()]


@router.post("", response_model=FaqItemOut, status_code=status.HTTP_201_CREATED)
async def create_faq_item(
    body: FaqItemCreate,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    f = FaqItem(
        id=make_id("faq"),
        question_nl=body.question_nl,
        answer_nl=body.answer_nl,
        question_en=body.question_en or None,
        answer_en=body.answer_en or None,
        question_fr=body.question_fr or None,
        answer_fr=body.answer_fr or None,
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
        request_id=getattr(request.state, "request_id", None),
        details={"question_nl": f.question_nl},
    )
    await db.commit()
    await db.refresh(f)
    return faq_item_to_dict(f)


@router.put("/{faq_item_id}", response_model=FaqItemOut)
async def update_faq_item(
    faq_item_id: str,
    body: FaqItemUpdate,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    f = await get_or_404(db, FaqItem, faq_item_id, "FAQ item not found.")
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
    if body.sort_order is not None:
        f.sort_order = body.sort_order
    if body.active is not None:
        f.active = body.active
    await write_audit_entry(
        db,
        actor=actor,
        action="faq_item_updated",
        resource_type="faq_item",
        resource_id=f.id,
        request_id=getattr(request.state, "request_id", None),
        details={"fields_changed": sorted(fields_set)},
    )
    await db.commit()
    await db.refresh(f)
    return faq_item_to_dict(f)


@router.delete("/{faq_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_faq_item(
    faq_item_id: str,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    f = await get_or_404(db, FaqItem, faq_item_id, "FAQ item not found.")
    await db.delete(f)
    await write_audit_entry(
        db,
        actor=actor,
        action="faq_item_deleted",
        resource_type="faq_item",
        resource_id=faq_item_id,
        request_id=getattr(request.state, "request_id", None),
        details={},
    )
    await db.commit()
