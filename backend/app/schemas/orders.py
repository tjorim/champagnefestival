"""Order lines, order questions and their answers."""

from __future__ import annotations

from typing import Any, Literal, Self

from pydantic import ConfigDict, Field, model_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.poll import PollOptionLabels, PollQuestionTexts
from app.schemas.types import NonEmptyText, NonNegativeQuantity, OrderQuantity, PositiveQuantity, ResourceId, Text500


class OrderItemBase(ResponseModel):
    product_id: str
    name: str
    """Dutch name at order time. `name_*` hold the translations so the
    order can be shown in the booker's language; orders from before products were
    translated carry only `name`."""
    name_nl: str | None = None
    name_fr: str | None = None
    name_en: str | None = None
    quantity: PositiveQuantity
    price: float = Field(ge=0)
    category: str
    delivered_quantity: NonNegativeQuantity = 0
    """Always set: a stored line that only has the legacy `delivered` flag gets the whole quantity."""
    delivered: bool = False
    included_quantity: NonNegativeQuantity = 0
    """How many of `quantity` came free via a product bundle (see
    Product.included_product_id) — only `quantity - included_quantity` is
    billed at `price` per unit."""
    visible: bool = True
    """Whether this line should be shown in the visitor-facing order summary —
    true when explicitly ordered, or when included via a bundle whose target
    product is itself `purchasable` (see Product.purchasable). Always counted
    for stock/prep regardless."""

    @model_validator(mode="before")
    @classmethod
    def derive_delivered_quantity(cls, data: Any) -> Any:
        if isinstance(data, dict) and data.get("delivered_quantity") is None:
            quantity = data.get("quantity")
            delivered = bool(data.get("delivered")) and isinstance(quantity, int)
            return {**data, "delivered_quantity": quantity if delivered else 0}
        return data

    @model_validator(mode="after")
    def validate_delivery_quantities(self) -> Self:
        delivered_quantity = self.delivered_quantity
        if delivered_quantity > self.quantity:
            raise ValueError("delivered_quantity cannot exceed quantity.")
        if self.included_quantity > self.quantity:
            raise ValueError("included_quantity cannot exceed quantity.")

        self.delivered_quantity = delivered_quantity
        self.delivered = delivered_quantity == self.quantity
        return self


class OrderItemOut(OrderItemBase):
    pass


class OrderItemRequest(RequestModel):
    """What a registration request supplies for an order line item.

    Only `product_id` and `quantity` are client-supplied; `name`/`price`/`category`
    are resolved server-side against the event's real products (see
    `app.services.registrations_service.resolve_order_items`) so a client can never set an
    arbitrary or zero price, or order a product that doesn't exist.
    """

    product_id: NonEmptyText
    quantity: OrderQuantity


OrderQuestionKind = Literal["single_choice", "free_text", "rating"]


class OrderOptionWrite(PollOptionLabels):
    id: ResourceId

    @model_validator(mode="after")
    def check_label(self) -> Self:
        return self.validate_dutch()


class OrderQuestionWrite(PollQuestionTexts):
    id: ResourceId
    kind: OrderQuestionKind
    active: bool = True
    options: list[OrderOptionWrite] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def check_question(self) -> Self:
        self.validate_dutch()
        ids = [o.id for o in self.options]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate options.")
        return self


class OrderOptionOut(ResponseModel):
    id: str
    label_nl: str
    label_fr: str | None
    label_en: str | None


class OrderQuestionOut(ResponseModel):
    """An event's order question as stored: Dutch text is always present (`OrderQuestionWrite` enforces it)."""

    id: str
    kind: OrderQuestionKind
    active: bool
    title_nl: str
    title_fr: str | None
    title_en: str | None
    description_nl: str | None
    description_fr: str | None
    description_en: str | None
    options: list[OrderOptionOut]


class OrderQuestionList(RequestModel):
    questions: list[OrderQuestionWrite] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def unique_questions(self) -> Self:
        ids = [q.id for q in self.questions]
        options = [o.id for q in self.questions for o in q.options]
        if len(ids) != len(set(ids)) or len(options) != len(set(options)):
            raise ValueError("Question and option IDs must be unique.")
        return self


class OrderAnswerIn(RequestModel):
    question_id: ResourceId
    option_id: ResourceId | None = None
    text: Text500 | None = None
    rating: int | None = Field(default=None, ge=1, le=5, strict=True)


class OrderAnswerOut(OrderAnswerIn):
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    question: OrderQuestionOut
