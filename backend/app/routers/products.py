"""Event-scoped product management endpoints (admin only).

Products are what registration.order_items line items resolve against — see
`Product`'s docstring in app.models. There is no global catalog: every
product belongs to exactly one event.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, update
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


async def _validate_inclusion_target(
    db: AsyncSession, event_id: str, self_id: str | None, included_product_id: str
) -> None:
    if included_product_id == self_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A product cannot include itself.")
    if self_id is not None:
        # Single-level bundles only: this product cannot bundle another product
        # while some other product already bundles it.
        includer = (await db.execute(select(Product.id).where(Product.included_product_id == self_id))).first()
        if includer is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This product is already bundled by another product and cannot bundle one itself.",
            )
    result = await db.execute(select(Product).where(Product.id == included_product_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Included product not found.")
    if target.event_id != event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Included product must belong to the same event.",
        )
    if target.included_product_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Included product cannot itself bundle another product.",
        )


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    await get_or_404(db, Event, body.event_id, "Event not found.")
    if body.included_product_id is not None:
        await _validate_inclusion_target(db, body.event_id, None, body.included_product_id)
    product = Product(
        id=make_id("prod"),
        event_id=body.event_id,
        name=body.name,
        price=body.price,
        category=body.category,
        active=body.active,
        required=body.required,
        included_product_id=body.included_product_id,
        included_per_guests=body.included_per_guests,
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
    if body.required is not None:
        product.required = body.required

    if "included_product_id" in body.model_fields_set or "included_per_guests" in body.model_fields_set:
        resulting_included_product_id = (
            body.included_product_id if "included_product_id" in body.model_fields_set else product.included_product_id
        )
        resulting_included_per_guests = (
            body.included_per_guests if "included_per_guests" in body.model_fields_set else product.included_per_guests
        )
        if (resulting_included_product_id is None) != (resulting_included_per_guests is None):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="included_product_id and included_per_guests must be set together.",
            )
        if resulting_included_product_id is not None:
            await _validate_inclusion_target(db, product.event_id, product.id, resulting_included_product_id)
        product.included_product_id = resulting_included_product_id
        product.included_per_guests = resulting_included_per_guests

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
    # ON DELETE SET NULL clears included_product_id on any product that bundles
    # this one; clear its paired quantity too so the "both or neither" invariant holds.
    await db.execute(
        update(Product)
        .where(Product.included_product_id == product_id)
        .values(included_product_id=None, included_per_guests=None)
    )
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
