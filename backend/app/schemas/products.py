"""Products sold at an event and their changes."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.core.vocabularies import ProductUnit
from app.schemas.base import RequestModel, ResponseModel
from app.schemas.orders import OrderItemOut
from app.schemas.types import (
    NonEmptyText50,
    OrderQuantity,
    ProductPrice,
    ResourceId,
    StockQuantity,
    Text200,
    Text300,
)

InclusionBasis = Literal["quantity", "guests"]
"""What `per_quantity` counts: units of the including product that were ordered
(`quantity`), or the booking's guests (`guests`). A guest-based inclusion yields
`quantity` units per `per_quantity` guests whatever quantity of the including
product was ordered, e.g. a VIP table that includes one bottle per two guests."""


class ProductInclusionOut(ResponseModel):
    product_id: str
    quantity: int
    per_quantity: int
    rounding: Literal["up", "down"]
    basis: InclusionBasis = "quantity"


class ProductInclusion(RequestModel):
    product_id: ResourceId
    quantity: OrderQuantity = 1
    per_quantity: OrderQuantity = 1
    rounding: Literal["up", "down"] = "down"
    basis: InclusionBasis = "quantity"


class ProductTextFields(RequestModel):
    """Product name and description per language (#1222), like event titles: Dutch
    must have the name, the description is optional (but needs Dutch text when
    present), and visitors fall back to Dutch. A blank text is stored as `None`."""

    name_nl: Text200 | None = None
    name_fr: Text200 | None = None
    name_en: Text200 | None = None
    description_nl: Text300 | None = None
    description_fr: Text300 | None = None
    description_en: Text300 | None = None

    @field_validator(
        "name_nl", "name_fr", "name_en", "description_nl", "description_fr", "description_en", mode="before"
    )
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.name_nl:
            raise ValueError("A product name requires non-empty Dutch text.")
        if any((self.description_fr, self.description_en)) and not self.description_nl:
            raise ValueError("A description requires non-empty Dutch text.")
        return self


class ProductCreate(ProductTextFields):
    unit: ProductUnit = "item"
    stock: StockQuantity | None = None
    inclusions: list[ProductInclusion] = Field(default_factory=list, max_length=50)
    """Other products of this event bundled into this one; empty means none."""
    event_id: ResourceId
    price: ProductPrice
    category: NonEmptyText50
    """Key of a product category (see ``/api/product-categories``)."""
    purchasable: bool = True
    required: bool = False

    @model_validator(mode="after")
    def check_text(self) -> Self:
        return self.validate_dutch()

    @model_validator(mode="after")
    def validate_required_implies_purchasable(self) -> Self:
        if self.required and not self.purchasable:
            raise ValueError("A required product must be purchasable.")
        return self


class ProductUpdate(ProductTextFields):
    unit: ProductUnit | None = None
    stock: StockQuantity | None = None
    inclusions: list[ProductInclusion] | None = Field(default=None, max_length=50)
    """Replaces the bundled products; ``[]`` removes them all, omitted keeps them."""
    update_existing_contents: bool = False
    update_existing_prices: bool = False
    confirm_shortage: bool = False
    preview_token: str | None = None
    price: ProductPrice | None = None
    category: NonEmptyText50 | None = None
    purchasable: bool | None = None
    required: bool | None = None
    # `purchasable`/`required` are validated against the *resulting* state
    # (see app.services.product_changes.change_product): a PATCH may touch
    # only one of them while leaving the other as already stored.


class ProductOut(ResponseModel):
    unit: ProductUnit = "item"
    stock: int | None = None
    reserved_quantity: int = 0
    available_quantity: int | None = None
    shortage: int = 0
    sold_out: bool = False
    """A purchasable product with no remaining stock. Distinct from
    `purchasable` — a sold-out product stays purchasable (and visible), just
    unorderable until restocked."""
    inclusions: list[ProductInclusionOut]
    id: str
    event_id: str
    name: str
    """Dutch name (admin shape); the per-language fields below hold every translation."""
    description: str = ""
    name_nl: str | None = None
    name_fr: str | None = None
    name_en: str | None = None
    description_nl: str | None = None
    description_fr: str | None = None
    description_en: str | None = None
    price: Decimal
    category: str
    purchasable: bool
    required: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductPublicOut(ResponseModel):
    """The visitor-facing shape of a product: always `purchasable=True` —
    see app.utils.event_to_summary_out, which excludes every hidden
    (`purchasable=False`) product from the public response entirely, and
    strips any `inclusions` edge that targets one."""

    id: str
    name: str
    """Resolved for the requested `locale` (Dutch when none) — see `ProductOut`."""
    description: str = ""
    name_nl: str | None = None
    name_fr: str | None = None
    name_en: str | None = None
    description_nl: str | None = None
    description_fr: str | None = None
    description_en: str | None = None
    price: Decimal
    category: str
    unit: ProductUnit = "item"
    required: bool
    purchasable: bool
    available_quantity: int | None = None
    sold_out: bool = False
    inclusions: list[ProductInclusionOut]

    model_config = ConfigDict(from_attributes=True)


class ProductChangeShortageOut(ResponseModel):
    product_id: str
    name: str
    stock: int
    reserved: int
    shortage: int


class ProductChangeBookingOut(ResponseModel):
    id: str
    before_total: str
    after_total: str
    amount_paid: str
    refund_due: str
    before_items: list[OrderItemOut]
    after_items: list[OrderItemOut]


class ProductChangePreviewOut(ResponseModel):
    """What saving a product change would do to existing bookings, without saving it.

    Send ``preview_token`` back with the save to confirm this exact preview was reviewed.
    """

    preview_token: str
    bookings: list[ProductChangeBookingOut]
    shortages: list[ProductChangeShortageOut]
    price_changed: bool
    contents_changed: bool
