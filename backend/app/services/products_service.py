"""Shared application-service operations for products.

Used by both ``app.routers.products`` (REST) and ``app.mcp.admin.products``
(MCP) so bundle-target validation, the purchasable/stock/inclusion CRUD
rules, and audit-detail assembly live in exactly one place instead of two
copies — following the same convention as ``app.services.events_service``.
Raises ``HTTPException`` directly; the MCP adapter translates it into
``MCPToolError`` at its own boundary (``app.mcp.utils.as_value_error``).
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Product
from app.schemas import ProductCreate, ProductUpdate
from app.services import product_inventory as inventory
from app.services.product_changes import change_product
from app.utils import get_or_404, make_id


async def validate_inclusion_target(
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


async def get_product_or_404(db: AsyncSession, product_id: str) -> Product:
    return await get_or_404(db, Product, product_id, "Product not found.")


async def list_products(db: AsyncSession, event_id: str | None = None) -> list[Product]:
    stmt = select(Product).order_by(Product.created_at)
    if event_id is not None:
        stmt = stmt.where(Product.event_id == event_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_product(
    db: AsyncSession, body: ProductCreate, *, actor: str, request_id: str | None = None
) -> Product:
    event = await inventory.lock_event(db, body.event_id)
    if body.included_product_id is not None:
        await validate_inclusion_target(db, body.event_id, None, body.included_product_id)
    product = Product(
        id=make_id("prod"),
        event_id=body.event_id,
        name=body.name,
        description=body.description,
        price=body.price,
        category=body.category,
        purchasable=body.purchasable,
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
        request_id=request_id,
        details={"event_id": product.event_id, "name": product.name},
    )
    await db.commit()
    await db.refresh(product)
    return product


async def update_product(
    db: AsyncSession, product_id: str, body: ProductUpdate, *, actor: str, request_id: str | None = None
) -> Product:
    if body.included_product_id is not None and body.inclusions is None:
        existing = await get_or_404(db, Product, product_id, "Product not found.")
        await inventory.lock_event(db, existing.event_id)
        await validate_inclusion_target(db, existing.event_id, product_id, body.included_product_id)
    return await change_product(db, product_id, body, preview=False, actor=actor, request_id=request_id)


async def preview_product_update(db: AsyncSession, product_id: str, body: ProductUpdate) -> dict:
    # Same calculation and fingerprint as saving, but no persisted mutation.
    try:
        with db.no_autoflush:
            return await change_product(db, product_id, body, preview=True, actor="", request_id=None)
    finally:
        await db.rollback()


async def delete_product(db: AsyncSession, product_id: str, *, actor: str, request_id: str | None = None) -> None:
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
        request_id=request_id,
        details={},
    )
    await db.commit()
