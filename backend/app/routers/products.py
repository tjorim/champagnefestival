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
from app.models import Product
from app.schemas import ProductCreate, ProductOut, ProductUpdate
from app.services import product_inventory as inventory
from app.services.product_changes import change_product
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
    event = await inventory.lock_event(db, body.event_id)
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
        unit=body.unit,
        stock=body.stock,
        inclusions=[i.model_dump() for i in body.inclusions] if body.inclusions is not None else None,
    )
    graph = inventory.current_snapshot(event)
    graph[product.id] = {"inclusions": product.inclusions, "included_product_id": product.included_product_id}
    inventory.validate_graph(graph)
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
    if body.included_product_id is not None and body.inclusions is None:
        existing = await get_or_404(db, Product, product_id, "Product not found.")
        await inventory.lock_event(db, existing.event_id)
        await _validate_inclusion_target(db, existing.event_id, product_id, body.included_product_id)
    product = await change_product(
        db, product_id, body, preview=False, actor=actor, request_id=getattr(request.state, "request_id", None)
    )
    return product_to_dict(product)


@router.post("/{product_id}/preview")
async def preview_product(product_id: str, body: ProductUpdate, db: AsyncSession = Depends(get_db)) -> dict:
    # Same calculation and fingerprint as saving, but no persisted mutation.
    with db.no_autoflush:
        result = await change_product(db, product_id, body, preview=True, actor="", request_id=None)
    await db.rollback()
    return result


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    product = await get_or_404(db, Product, product_id, "Product not found.")
    graph = inventory.current_snapshot(await inventory.lock_event(db, product.event_id))
    if any(any(edge["product_id"] == product_id for edge in node.get("inclusions") or []) for node in graph.values()):
        raise HTTPException(409, "Remove this product from packages before deleting it.")
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
