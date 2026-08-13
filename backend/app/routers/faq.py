"""FAQ item management endpoints.

Business logic lives in ``app.services.faq_service`` and is shared with
``app.mcp.admin.faq`` — this router is a thin adapter that translates
``ServiceError`` into ``HTTPException`` (see #807, #836).
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import FaqItem
from app.schemas import FaqItemCreate, FaqItemOut, FaqItemPublicOut, FaqItemReorder, FaqItemUpdate, FaqLocale
from app.services import faq_service
from app.services.errors import ServiceError, to_http_exception
from app.utils import faq_item_to_public_dict

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
    return await faq_service.list_faq_items(db)


@router.post("", response_model=FaqItemOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_faq_item(
    body: FaqItemCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await faq_service.create_faq_item(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{faq_item_id}", response_model=FaqItemOut, dependencies=[Depends(require_admin)])
async def update_faq_item(
    faq_item_id: str,
    body: FaqItemUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await faq_service.update_faq_item(
            db,
            actor=actor,
            faq_item_id=faq_item_id,
            body=body,
            request_id=getattr(request.state, "request_id", None),
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/reorder", response_model=list[FaqItemOut], dependencies=[Depends(require_admin)])
async def reorder_faq_items(
    body: FaqItemReorder,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> list[dict]:
    """Reassign every FAQ item's display position to match ``body.ordered_ids``.

    The dedicated, all-at-once operation (rather than one PUT per item) is
    what keeps a reorder from landing in a partially-applied, ambiguous state
    (#836).
    """
    try:
        return await faq_service.reorder_faq_items(
            db,
            actor=actor,
            ordered_ids=body.ordered_ids,
            request_id=getattr(request.state, "request_id", None),
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{faq_item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_faq_item(
    faq_item_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await faq_service.delete_faq_item(
            db, actor=actor, faq_item_id=faq_item_id, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
