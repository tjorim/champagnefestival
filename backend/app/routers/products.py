"""Event-scoped product management endpoints (admin only).

Products are what registration.pre_orders line items resolve against — see
`Product`'s docstring in app.models. There is no global catalogue: every
product belongs to exactly one event.
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import Event, Product
from app.schemas import ProductCreate, ProductOut, ProductUpdate
from app.utils import get_or_404, make_id, product_to_dict

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
) -> dict:
    await get_or_404(db, Event, body.event_id, "Event not found.")
    product = Product(
        id=make_id("prod"),
        event_id=body.event_id,
        name=body.name,
        price=body.price,
        category=body.category,
        active=body.active,
    )
    db.add(product)
    await write_audit_entry(
        db,
        actor=actor,
        action="product_created",
        resource_type="product",
        resource_id=product.id,
        request_id=getattr(request.state, "request_id", None),
        details={"event_id": product.event_id, "name": product.name},
    )
    await db.commit()
    await db.refresh(product)
    return product_to_dict(product)


@router.get("", response_model=list[ProductOut])
async def list_products(
    db: AsyncSession = Depends(get_db),
    event_id: str | None = Query(default=None),
) -> list[dict]:
    stmt = select(Product).order_by(Product.created_at)
    if event_id is not None:
        stmt = stmt.where(Product.event_id == event_id)
    result = await db.execute(stmt)
    return [product_to_dict(p) for p in result.scalars().all()]


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return product_to_dict(await get_or_404(db, Product, product_id, "Product not found."))


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: str,
    body: ProductUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    product = await get_or_404(db, Product, product_id, "Product not found.")
    if body.name is not None:
        product.name = body.name
    if body.price is not None:
        product.price = body.price
    if body.category is not None:
        product.category = body.category
    if body.active is not None:
        product.active = body.active
    await write_audit_entry(
        db,
        actor=actor,
        action="product_updated",
        resource_type="product",
        resource_id=product.id,
        request_id=getattr(request.state, "request_id", None),
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(product)
    return product_to_dict(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    product = await get_or_404(db, Product, product_id, "Product not found.")
    await db.delete(product)
    await write_audit_entry(
        db,
        actor=actor,
        action="product_deleted",
        resource_type="product",
        resource_id=product_id,
        request_id=getattr(request.state, "request_id", None),
        details={},
    )
    await db.commit()
