"""Event-scoped product management endpoints (admin only).

Products are what registration.order_items line items resolve against — see
`Product`'s docstring in app.models. There is no global catalog: every
product belongs to exactly one event.

Business logic lives in ``app.services.products_service`` and is shared with
``app.mcp.admin.products``; this module only wires HTTP concerns (auth,
request/response schemas, the request id) around it.
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_actor_id, require_admin
from app.db.session import get_db
from app.schemas import ProductChangePreviewOut, ProductCreate, ProductOut, ProductUpdate
from app.services import products_service
from app.services.serializers import product_to_out

router = APIRouter(
    prefix="/api/products",
    tags=["products"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> ProductOut:
    product = await products_service.create_product(
        db, body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )
    return product_to_out(product)


@router.get("", response_model=list[ProductOut])
async def list_products(
    db: AsyncSession = Depends(get_db),
    event_id: str | None = Query(default=None),
) -> list[ProductOut]:
    products = await products_service.list_products(db, event_id)
    return [product_to_out(p) for p in products]


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)) -> ProductOut:
    return product_to_out(await products_service.get_product_or_404(db, product_id))


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: str,
    body: ProductUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> ProductOut:
    product = await products_service.update_product(
        db, product_id, body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )
    return product_to_out(product)


@router.post("/{product_id}/preview", response_model=ProductChangePreviewOut)
async def preview_product(
    product_id: str, body: ProductUpdate, db: AsyncSession = Depends(get_db)
) -> ProductChangePreviewOut:
    return await products_service.preview_product_update(db, product_id, body)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    await products_service.delete_product(
        db, product_id, actor=actor, request_id=getattr(request.state, "request_id", None)
    )
