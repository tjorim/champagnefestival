"""Shared application-service operations for products.

Used by both ``app.routers.products`` (REST) and ``app.mcp.admin.products``
(MCP) so the purchasable/stock/inclusion CRUD
rules, and audit-detail assembly live in exactly one place instead of two
copies — following the same convention as ``app.services.events_service``.
Raises ``HTTPException`` directly; the MCP adapter translates it into
``MCPToolError`` at its own boundary (``app.mcp.utils.as_value_error``).
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import make_id
from app.db.queries import get_or_404
from app.models import Product
from app.schemas import ProductChangePreviewOut, ProductCreate, ProductUpdate
from app.services import product_inventory as inventory
from app.services.audit_service import write_audit_entry
from app.services.product_changes import TEXT_FIELDS, change_product, ensure_category_exists


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
    await ensure_category_exists(db, body.category)
    product = Product(
        id=make_id("prod"),
        event_id=body.event_id,
        **body.model_dump(include=set(TEXT_FIELDS)),
        price=body.price,
        category=body.category,
        purchasable=body.purchasable,
        required=body.required,
        unit=body.unit,
        stock=body.stock,
        inclusions=[i.model_dump() for i in body.inclusions],
    )
    graph = inventory.current_snapshot(event)
    graph[product.id] = {"inclusions": product.inclusions}
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
    return await change_product(db, product_id, body, preview=False, actor=actor, request_id=request_id)


async def preview_product_update(db: AsyncSession, product_id: str, body: ProductUpdate) -> ProductChangePreviewOut:
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
