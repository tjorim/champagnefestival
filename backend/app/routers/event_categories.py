"""Event category endpoints.

The list is public (the schedule needs the labels); changes are admin-only.
Business logic lives in ``app.services.event_categories_service`` and is shared
with ``app.mcp.admin.event_categories``.
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import EventCategoryCreate, EventCategoryOut, EventCategoryUpdate
from app.services import event_categories_service
from app.services.errors import ServiceError, to_http_exception
from app.translations import Language

router = APIRouter(prefix="/api/event-categories", tags=["event-categories"])


@router.get("", response_model=list[EventCategoryOut])
async def list_event_categories(
    db: AsyncSession = Depends(get_db), locale: Language | None = Query(default=None)
) -> list[dict]:
    """Every category in display order. `label` is resolved for `locale`; all stored labels are included."""
    return await event_categories_service.list_categories(db, locale=locale)


@router.post(
    "", response_model=EventCategoryOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)]
)
async def create_event_category(
    body: EventCategoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await event_categories_service.create_category(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{key}", response_model=EventCategoryOut, dependencies=[Depends(require_admin)])
async def update_event_category(
    key: str,
    body: EventCategoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await event_categories_service.update_category(
            db, actor=actor, key=key, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{key}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_event_category(
    key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await event_categories_service.delete_category(
            db, actor=actor, key=key, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
