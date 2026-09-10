"""Admin (write) MCP tool implementations for product management.

Mirrors ``app.routers.products``. Business logic — bundle-target validation,
the create/update/delete transitions, and audit-detail assembly — lives in
``app.services.products_service`` and is shared with the REST router; this
module is responsible only for validating MCP kwargs into a schema instance
and translating ``HTTPException`` into ``MCPToolError`` at its own boundary.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.mcp.utils import as_value_error, validate_with_schema
from app.schemas import ProductCreate, ProductUpdate
from app.services import products_service
from app.utils import product_to_dict


async def create_product(
    session_factory: Any,
    actor: str,
    *,
    event_id: str,
    name: str,
    price: float,
    category: str,
    description: str = "",
    purchasable: bool = True,
    required: bool = False,
    unit: str = "item",
    stock: int | None = None,
    inclusions: list[dict] | None = None,
    included_product_id: str | None = None,
    included_per_guests: int | None = None,
) -> dict:
    body = validate_with_schema(
        ProductCreate,
        event_id=event_id,
        name=name,
        description=description,
        price=price,
        category=category,
        purchasable=purchasable,
        required=required,
        unit=unit,
        stock=stock,
        inclusions=inclusions,
        included_product_id=included_product_id,
        included_per_guests=included_per_guests,
    )
    async with session_factory() as db:
        try:
            product = await products_service.create_product(db, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return product_to_dict(product)


async def get_product(session_factory: Any, product_id: str) -> dict:
    async with session_factory() as db:
        try:
            product = await products_service.get_product_or_404(db, product_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return product_to_dict(product)


async def list_products(session_factory: Any, event_id: str | None = None) -> list[dict]:
    async with session_factory() as db:
        products = await products_service.list_products(db, event_id)
        return [product_to_dict(p) for p in products]


async def update_product(
    session_factory: Any,
    actor: str,
    product_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    price: float | None = None,
    category: str | None = None,
    purchasable: bool | None = None,
    required: bool | None = None,
    unit: str | None = None,
    stock: int | None = None,
    inclusions: list[dict] | None = None,
    included_product_id: str | None = None,
    included_per_guests: int | None = None,
    clear_stock: bool = False,
    clear_inclusions: bool = False,
    clear_included_product_id: bool = False,
    clear_included_per_guests: bool = False,
    update_existing_contents: bool = False,
    update_existing_prices: bool = False,
    confirm_shortage: bool = False,
    preview_token: str | None = None,
) -> dict:
    """Partially update a product; omitted fields are left unchanged.

    ``stock``/``inclusions``/``included_product_id``/``included_per_guests``
    are nullable with no natural "clear" value via a plain optional parameter
    (there's no ambiguity-free way to tell "leave unchanged" apart from
    "unset it" through a bare ``None`` default) — pass ``clear_stock=True`` /
    ``clear_inclusions=True`` / ``clear_included_product_id=True`` /
    ``clear_included_per_guests=True`` to null them out instead of providing
    a value. A product edit that touches existing bookings' contents or
    prices requires a fresh ``preview_token`` from a prior call with
    ``update_existing_contents``/``update_existing_prices`` set — call this
    tool once to preview (its result includes ``preview_token``), then again
    with that token to save; see ``app.services.product_changes.change_product``.
    """
    provided: dict[str, Any] = {
        k: v
        for k, v in {
            "name": name,
            "description": description,
            "price": price,
            "category": category,
            "purchasable": purchasable,
            "required": required,
            "unit": unit,
            "stock": stock,
            "inclusions": inclusions,
            "included_product_id": included_product_id,
            "included_per_guests": included_per_guests,
        }.items()
        if v is not None
    }
    if clear_stock:
        provided["stock"] = None
    if clear_inclusions:
        provided["inclusions"] = []
    if clear_included_product_id:
        provided["included_product_id"] = None
    if clear_included_per_guests:
        provided["included_per_guests"] = None
    provided["update_existing_contents"] = update_existing_contents
    provided["update_existing_prices"] = update_existing_prices
    provided["confirm_shortage"] = confirm_shortage
    provided["preview_token"] = preview_token
    body = validate_with_schema(ProductUpdate, **provided)

    async with session_factory() as db:
        try:
            product = await products_service.update_product(db, product_id, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return product_to_dict(product)


async def delete_product(session_factory: Any, actor: str, product_id: str) -> dict:
    async with session_factory() as db:
        try:
            await products_service.delete_product(db, product_id, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return {"deleted": True, "id": product_id}
