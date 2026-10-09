"""Product category endpoints.

The list is public (category keys are what products and orders carry); changes are admin-only.
Business logic lives in ``app.services.product_categories_service`` and is shared
with ``app.mcp.admin.product_categories``.
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.services import product_categories_service
from app.services.errors import ServiceError, to_http_exception
from app.translations import Language

router = APIRouter(prefix="/api/product-categories", tags=["product-categories"])


@router.get("", response_model=list[CategoryOut])
async def list_product_categories(
    db: AsyncSession = Depends(get_db), locale: Language | None = Query(default=None)
) -> list[dict]:
    """Every category in display order. `label` is resolved for `locale`; all stored labels are included."""
    return await product_categories_service.list_categories(db, locale=locale)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_product_category(
    body: CategoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await product_categories_service.create_category(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{key}", response_model=CategoryOut, dependencies=[Depends(require_admin)])
async def update_product_category(
    key: str,
    body: CategoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await product_categories_service.update_category(
            db, actor=actor, key=key, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{key}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_product_category(
    key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await product_categories_service.delete_category(
            db, actor=actor, key=key, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
