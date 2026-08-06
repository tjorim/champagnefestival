"""FAQ item management endpoints."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import FaqItem
from app.schemas import FaqItemCreate, FaqItemOut, FaqItemUpdate
from app.utils import faq_item_to_dict, get_or_404, make_id

router = APIRouter(
    prefix="/api/faq",
    tags=["faq"],
)


@router.get("/active", response_model=list[FaqItemOut])
async def list_active_faq_items(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Public: active FAQ items, in display order."""
    stmt = select(FaqItem).where(FaqItem.active.is_(True)).order_by(FaqItem.sort_order)
    result = await db.execute(stmt)
    return [faq_item_to_dict(f) for f in result.scalars().all()]


@router.get("", response_model=list[FaqItemOut], dependencies=[Depends(require_admin)])
async def list_faq_items(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Admin: every FAQ item, active or not, in display order."""
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
        question=body.question,
        answer=body.answer,
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
        details={"question": f.question},
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
    if body.question is not None:
        f.question = body.question
    if body.answer is not None:
        f.answer = body.answer
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
        details={"fields_changed": sorted(body.model_fields_set)},
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
