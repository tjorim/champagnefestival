"""Pydantic request / response schemas."""

from __future__ import annotations

import re
from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Self
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.composer_content import LOCALES, build_composer_payload, pick_locale_text
from app.models import MAX_POLL_PEOPLE, MAX_POLL_QUANTITY
from app.schema_types import (
    AreaDimension,
    ClockTime,
    EditionYear,
    FloorPlanPosition,
    FloorPlanRotation,
    GuestCount,
    HexColor,
    MarkdownSource,
    MemberInactivityMonths,
    MemberLimit,
    MonthlyVisits,
    NonEmptyText,
    NonEmptyText50,
    NonEmptyText200,
    NonEmptyText600,
    NonNegativeQuantity,
    OrderQuantity,
    PositiveQuantity,
    ProductPrice,
    ResourceId,
    ResourceKey,
    RoomDimension,
    SortOrder,
    StockQuantity,
    TableCapacity,
    TableDimension,
    Text20,
    Text30,
    Text50,
    Text100,
    Text120,
    Text200,
    Text300,
    Text500,
    Text600,
    Text1000,
    Text2000,
    Text4000,
    Text10000,
)

# ---------------------------------------------------------------------------
# Shared value types
# ---------------------------------------------------------------------------

EditionType = Literal["festival", "bourse", "capsule_exchange"]
SponsorTier = Literal["main", "partner", "supporter"]
RegistrationStatus = Literal["pending", "confirmed", "cancelled"]
PaymentStatus = Literal["unpaid", "partial", "paid"]
FaqLocale = Literal["nl", "en", "fr"]
AnnouncementLevel = Literal["info", "warning", "urgent"]


class RequestModel(BaseModel):
    """Base for external request bodies; reject misspelled or stale fields."""

    model_config = ConfigDict(extra="forbid")


def _validate_safe_announcement_url(value: str | None) -> str | None:
    """Accept only absolute HTTPS announcement links without embedded credentials."""
    if value is None:
        return None
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("link_url must be a safe HTTPS URL without credentials")
    return value


# ---------------------------------------------------------------------------
# Order items
# ---------------------------------------------------------------------------


class OrderItemBase(BaseModel):
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
    delivered_quantity: NonNegativeQuantity | None = None
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

    @model_validator(mode="after")
    def validate_delivery_quantities(self) -> Self:
        delivered_quantity = self.delivered_quantity
        if delivered_quantity is None:
            delivered_quantity = self.quantity if self.delivered else 0
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


class RegistrationDeliveryUpdate(RequestModel):
    """The only order-line fields an entrance volunteer may change."""

    product_id: NonEmptyText
    delivered_quantity: NonNegativeQuantity


# ---------------------------------------------------------------------------
# People (output — defined early so registration schemas can reference it)
# ---------------------------------------------------------------------------


class PersonSummaryOut(BaseModel):
    """Minimal person projection used in public-facing reservation responses.

    Omits sensitive/admin-only fields so that the public reservation endpoints
    cannot leak PII (address, roles, national register number, notes, etc.).
    """

    id: str
    name: str
    email: str
    phone: str
    preferred_language: Literal["nl", "fr", "en"] | None = None

    model_config = ConfigDict(from_attributes=True)


class RoleStretchOut(BaseModel):
    """One stretch of holding a role; ``started_on`` is null when the start is unknown."""

    started_on: dt_date | None = None
    ended_on: dt_date | None = None


class PersonOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    preferred_language: Literal["nl", "fr", "en"] | None = None
    address: str
    roles: list[str]
    retired_roles: dict[str, str] = {}
    role_history: dict[str, list[RoleStretchOut]] = {}
    national_register_number: str | None
    eid_document_number: str | None
    inactivity_exempt: bool = False
    inactivity_exempt_note: str = ""
    visits_per_month: int | None
    notes: str
    anonymised: bool
    marketing_opt_in: bool
    marketing_opt_in_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PersonAdminSummaryOut(BaseModel):
    """``PersonOut`` without the volunteer-only identity fields.

    Used for the general people/members list and single-person reads, which
    have no business rendering a NISS/eID that belongs to a small subset of
    rows — see docs/decisions/934-data-retention-and-erasure.md. Create,
    update, and merge keep returning the full ``PersonOut`` unchanged: those
    responses echo back data the caller just explicitly provided or is
    actively verifying (e.g. a merge adopting an identity field from a
    duplicate), not passive browsing.
    """

    id: str
    name: str
    email: str
    phone: str
    preferred_language: Literal["nl", "fr", "en"] | None = None
    address: str
    roles: list[str]
    retired_roles: dict[str, str] = {}
    role_history: dict[str, list[RoleStretchOut]] = {}
    inactivity_exempt: bool = False
    inactivity_exempt_note: str = ""
    visits_per_month: int | None
    notes: str
    anonymised: bool
    marketing_opt_in: bool
    marketing_opt_in_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PersonPaymentSummary(BaseModel):
    """Received/refunded/net paid/due/outstanding/refund-liability across one
    person's non-cancelled bookings (#1019) — traceable to their payment
    ledger entries, the person-level counterpart to ``EditionAttendanceStats``.
    """

    received: Decimal
    refunded: Decimal
    net_paid: Decimal
    due: Decimal
    outstanding: Decimal
    refund_liability: Decimal


class PersonListItemOut(PersonAdminSummaryOut):
    last_attended: dt_date | None = None
    inactivity_highlight: bool = False
    registration_count: int


class PeopleCountsOut(BaseModel):
    total: int
    active: int
    inactive: int
    by_role: dict[str, int]


class PersonListEnvelope(BaseModel):
    """Paginated response for the admin people/members lists.

    ``total`` counts every row matching the current filters, not just this
    page, so a client can tell ``items`` was truncated instead of silently
    rendering a partial result as if it were complete — see
    ``RegistrationListEnvelope``, which this mirrors.
    """

    items: list[PersonListItemOut]
    total: int
    limit: int
    page: int


# ---------------------------------------------------------------------------
# Edition / event projections used across multiple responses
# ---------------------------------------------------------------------------


class EditionSummaryOut(BaseModel):
    id: str
    year: int
    month: str
    edition_type: EditionType
    active: bool

    model_config = ConfigDict(from_attributes=True)


CATEGORY_KEY_PATTERN = r"^[a-z][a-z0-9_-]{0,49}$"


class CategoryLabels(RequestModel):
    """Per-language label of an event or product category: Dutch must have text."""

    label_nl: Text100 | None = None
    label_fr: Text100 | None = None
    label_en: Text100 | None = None

    @field_validator("label_nl", "label_fr", "label_en", mode="before")
    @classmethod
    def normalize_label(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.label_nl:
            raise ValueError("A category label requires non-empty Dutch text.")
        return self


class CategoryCreate(CategoryLabels):
    key: str = Field(
        pattern=CATEGORY_KEY_PATTERN,
        description="Stable identifier stored on the events or products using it: lowercase letters, digits, `-` and `_`. Cannot be changed.",
    )
    sort_order: SortOrder = 0

    @model_validator(mode="after")
    def check_label(self) -> Self:
        return self.validate_dutch()


class CategoryUpdate(CategoryLabels):
    """Partial update; the key is immutable."""

    sort_order: SortOrder | None = None


class CategoryOut(BaseModel):
    key: str
    label: str
    """The label resolved for the requested `locale` (Dutch when none)."""
    label_nl: str | None
    label_fr: str | None
    label_en: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PollQuestionTexts(RequestModel):
    """A poll question's title and description per language: Dutch is required for the title (and for the
    description once it has any text), French and English are optional translations, and volunteers fall
    back to Dutch. A blank text is stored as `None`."""

    title_nl: Text200 | None = None
    title_fr: Text200 | None = None
    title_en: Text200 | None = None
    description_nl: Text500 | None = None
    description_fr: Text500 | None = None
    description_en: Text500 | None = None

    @field_validator(
        "title_nl", "title_fr", "title_en", "description_nl", "description_fr", "description_en", mode="before"
    )
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.title_nl:
            raise ValueError("A poll question requires a non-empty Dutch title.")
        if any((self.description_fr, self.description_en)) and not self.description_nl:
            raise ValueError("A description requires non-empty Dutch text.")
        return self


class PollOptionLabels(RequestModel):
    """A poll option's label per language: Dutch is required, French and English are optional
    translations, and volunteers fall back to Dutch. A blank text is stored as `None`."""

    label_nl: Text200 | None = None
    label_fr: Text200 | None = None
    label_en: Text200 | None = None

    @field_validator("label_nl", "label_fr", "label_en", mode="before")
    @classmethod
    def normalize_label(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.label_nl:
            raise ValueError("A poll option requires a non-empty Dutch label.")
        return self


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
    question: OrderQuestionWrite


class EventTextFields(RequestModel):
    """Per-language event title and description (#1222).

    Same contract as ``OrganizationDescription``: Dutch must be filled, the
    others are optional, and public reads fall back to Dutch. A blank text is
    stored as ``None``. Unlike an organisation, an event always has a title.
    """

    title_nl: Text200 | None = None
    title_fr: Text200 | None = None
    title_en: Text200 | None = None
    description_nl: Text10000 | None = None
    description_fr: Text10000 | None = None
    description_en: Text10000 | None = None

    @field_validator(
        "title_nl",
        "title_fr",
        "title_en",
        "description_nl",
        "description_fr",
        "description_en",
        mode="before",
    )
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.title_nl:
            raise ValueError("A title requires non-empty Dutch text.")
        if any((self.description_fr, self.description_en)) and not self.description_nl:
            raise ValueError("A description requires non-empty Dutch text.")
        return self


class EventCreate(EventTextFields):
    edition_id: ResourceKey
    date: dt_date
    start_time: ClockTime
    end_time: ClockTime | None = None
    category: NonEmptyText50
    members_only: bool = False
    registration_required: bool = False
    registrations_open_from: datetime | None = None
    registrations_close_at: datetime | None = None
    active: bool = True

    @model_validator(mode="after")
    def check_text(self) -> Self:
        return self.validate_dutch()


class EventUpdate(EventTextFields):
    edition_id: ResourceKey | None = None
    date: dt_date | None = None
    start_time: ClockTime | None = None
    end_time: ClockTime | None = None
    category: NonEmptyText50 | None = None
    members_only: bool | None = None
    registration_required: bool | None = None
    registrations_open_from: datetime | None = None
    registrations_close_at: datetime | None = None
    active: bool | None = None


class EventTextOut(BaseModel):
    """The stored text of an event in every language.

    ``title``/``description`` on the enclosing model are the text resolved for
    the request locale (Dutch when none is requested), so clients that predate
    translations keep working.
    """

    title: str
    description: str
    title_nl: str | None = None
    title_fr: str | None = None
    title_en: str | None = None
    description_nl: str | None = None
    description_fr: str | None = None
    description_en: str | None = None


class EventOut(EventTextOut):
    id: str
    edition_id: str
    date: dt_date
    start_time: str
    end_time: str | None
    category: str
    members_only: bool = False
    registration_required: bool
    registrations_open_from: datetime | None
    registrations_close_at: datetime | None
    active: bool
    edition: EditionSummaryOut | None = None
    order_questions: list[OrderQuestionWrite] = Field(default_factory=list)
    products: list[ProductOut] = Field(default_factory=list)
    """Purchasable products only — see ProductOut. Empty means nothing to order."""
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventPublicOut(EventTextOut):
    """Visitor-facing event shape — see ProductPublicOut for why `products`
    differs from `EventOut.products`."""

    id: str
    edition_id: str
    date: dt_date
    start_time: str
    end_time: str | None
    category: str
    members_only: bool = False
    registration_required: bool
    registrations_open_from: datetime | None
    registrations_close_at: datetime | None
    active: bool
    order_questions: list[OrderQuestionWrite] = Field(default_factory=list)
    products: list[ProductPublicOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductInclusion(RequestModel):
    product_id: ResourceId
    quantity: OrderQuantity = 1
    per_quantity: OrderQuantity = 1
    rounding: Literal["up", "down"] = "down"


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
    unit: Literal["item", "table", "person"] = "item"
    stock: StockQuantity | None = None
    inclusions: list[ProductInclusion] | None = Field(default=None, max_length=50)
    event_id: ResourceId
    price: ProductPrice
    category: NonEmptyText50
    """Key of a product category (see ``/api/product-categories``)."""
    purchasable: bool = True
    required: bool = False
    included_product_id: ResourceId | None = None
    included_per_guests: PositiveQuantity | None = None

    @model_validator(mode="after")
    def check_text(self) -> Self:
        return self.validate_dutch()

    @model_validator(mode="after")
    def validate_inclusion_pair(self) -> Self:
        if (self.included_product_id is None) != (self.included_per_guests is None):
            raise ValueError("included_product_id and included_per_guests must be set together.")
        return self

    @model_validator(mode="after")
    def validate_required_implies_purchasable(self) -> Self:
        if self.required and not self.purchasable:
            raise ValueError("A required product must be purchasable.")
        return self


class ProductUpdate(ProductTextFields):
    unit: Literal["item", "table", "person"] | None = None
    stock: StockQuantity | None = None
    inclusions: list[ProductInclusion] | None = Field(default=None, max_length=50)
    update_existing_contents: bool = False
    update_existing_prices: bool = False
    confirm_shortage: bool = False
    preview_token: str | None = None
    price: ProductPrice | None = None
    category: NonEmptyText50 | None = None
    purchasable: bool | None = None
    required: bool | None = None
    # Nullable and independently settable, so the router (not this schema) decides
    # what "both or neither" means against the product's *resulting* state —
    # a PATCH may touch only one field while leaving the other as already stored.
    # `purchasable`/`required` are validated against the *resulting* state too
    # (see app.services.product_changes.change_product), for the same reason.
    included_product_id: ResourceId | None = None
    included_per_guests: PositiveQuantity | None = None


class ProductOut(BaseModel):
    unit: str = "item"
    stock: int | None = None
    reserved_quantity: int = 0
    available_quantity: int | None = None
    shortage: int = 0
    sold_out: bool = False
    """A purchasable product with no remaining stock. Distinct from
    `purchasable` — a sold-out product stays purchasable (and visible), just
    unorderable until restocked."""
    inclusions: list[ProductInclusion] | None = None
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
    included_product_id: str | None
    included_per_guests: int | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductPublicOut(BaseModel):
    """The visitor-facing shape of a product: always `purchasable=True` —
    see app.utils.event_to_summary_dict, which excludes every hidden
    (`purchasable=False`) product from the public response entirely, and
    strips any `inclusions`/`included_product_id` edge that targets one."""

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
    unit: str = "item"
    required: bool
    purchasable: bool
    available_quantity: int | None = None
    sold_out: bool = False
    inclusions: list[ProductInclusion] | None = None
    included_product_id: str | None = None
    included_per_guests: int | None = None

    model_config = ConfigDict(from_attributes=True)


class EventCheckInStats(BaseModel):
    """Guest counts for an event's live entrance display. `total`/`checked_in`
    are guest headcounts (sum of `guest_count`), not booking counts."""

    event_id: str
    event_title: str
    total: int
    checked_in: int


# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------


_MAX_REQUESTED_ORDER_LINE_QUANTITY = 1000
"""Ceiling on a client-requested (not yet package-expanded) order line quantity.

Far above any real booking (guest_count is capped at 20), but well below
OrderItemRequest.quantity's own 1,000,000 field bound, which stays high because
it also re-validates already-persisted order items when reconstructed
internally (see app.services.product_inventory.purchased_requests)."""


class RegistrationNotesRequest(RequestModel):
    order_answers: list[OrderAnswerIn] | None = Field(default=None, max_length=50)

    @model_validator(mode="before")
    @classmethod
    def merge_legacy_accessibility_note(cls, value):
        # Accept older REST/MCP callers while storing one notes field.
        if isinstance(value, dict) and "accessibility_note" in value:
            value = dict(value)
            accessibility = value.pop("accessibility_note")
            if accessibility is not None and not isinstance(accessibility, str):
                raise ValueError("accessibility_note must be text")
            if value.get("notes") is not None and not isinstance(value["notes"], str):
                raise ValueError("notes must be text")
            if accessibility:
                value["notes"] = "\n\n".join(
                    dict.fromkeys(part for part in (value.get("notes"), accessibility) if part)
                )
        return value

    @field_validator("order_items", check_fields=False)
    @classmethod
    def cap_requested_order_quantities(cls, items: list[OrderItemRequest] | None) -> list[OrderItemRequest] | None:
        for item in items or []:
            if item.quantity > _MAX_REQUESTED_ORDER_LINE_QUANTITY:
                raise ValueError(f"quantity cannot exceed {_MAX_REQUESTED_ORDER_LINE_QUANTITY} per order line.")
        return items


class RegistrationCreate(RegistrationNotesRequest):
    name: NonEmptyText200
    email: EmailStr
    phone: NonEmptyText50
    preferred_language: Literal["nl", "fr", "en"] = "nl"
    event_id: ResourceId
    guest_count: GuestCount
    order_items: list[OrderItemRequest] = Field(default_factory=list, max_length=50)
    notes: Text4000 = ""
    marketing_opt_in: bool = Field(
        default=False,
        description=(
            "Explicit, unticked-by-default consent to be contacted about future editions — "
            "a separate legal basis from the operational registration purpose. Never implied."
        ),
    )
    honeypot: str = Field(default="", exclude=True)
    form_start_time: str = Field(default="", exclude=True)

    @field_validator("name", "phone", "event_id", "notes", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class TableAllocation(RequestModel):
    table_id: ResourceId
    guest_count: int = Field(ge=0, le=20)
    exclusive: bool = False


class RegistrationUpdate(RegistrationNotesRequest):
    allocations: list[TableAllocation] | None = Field(default=None, max_length=1000)
    guest_count: GuestCount | None = None
    status: RegistrationStatus | None = None
    amount_due: ProductPrice | None = None
    confirm_over_capacity: bool = False
    order_items: list[OrderItemRequest] | None = Field(default=None, max_length=50)
    notes: Text4000 | None = None
    person_id: NonEmptyText | None = None
    checked_in: bool | None = None
    strap_issued: bool | None = None


class RegistrationVolunteerAssignment(RequestModel):
    """Admin override (#1044) attaching an unowned registration to a
    volunteer's own portal account, for a booking the volunteer never
    confirmed themselves via the self-service claim flow — e.g. they don't
    use the account much, or the booking predates their self-registration.
    """

    volunteer_id: NonEmptyText


class StampProgress(BaseModel):
    card_id: str
    stamps: int
    box_count: int
    reward_earned: bool


class RegistrationOut(BaseModel):
    stamp_progress: StampProgress | None = None
    order_answers: list[OrderAnswerOut] = Field(default_factory=list)
    booked_table_quantity: int = 0
    allocations: list[TableAllocation] = Field(default_factory=list)
    id: str
    person_id: str
    person: PersonSummaryOut
    event_id: str
    event: EventOut
    guest_count: int
    order_items: list[OrderItemOut]
    notes: str
    table_id: str | None
    status: RegistrationStatus
    payment_status: PaymentStatus
    amount_due: Decimal | None
    amount_paid: Decimal = Decimal(0)
    refund_due: Decimal | None = Decimal(0)
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RegistrationPublicOut(BaseModel):
    order_answers: list[OrderAnswerOut] = Field(default_factory=list)
    """Returned by the unauthenticated POST /api/registrations endpoint — the
    visitor's own just-created booking, but with `event` carrying the public
    product shape rather than the admin one RegistrationOut exposes."""

    booked_table_quantity: int = 0
    allocations: list[TableAllocation] = Field(default_factory=list)
    id: str
    person_id: str
    person: PersonSummaryOut
    event_id: str
    event: EventPublicOut
    guest_count: int
    order_items: list[OrderItemOut]
    notes: str
    table_id: str | None
    status: RegistrationStatus
    payment_status: PaymentStatus
    amount_due: Decimal | None
    amount_paid: Decimal = Decimal(0)
    refund_due: Decimal | None = Decimal(0)
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RegistrationOutWithToken(RegistrationOut):
    """Full registration including the sensitive check-in token.
    Only returned by the admin detail endpoint."""

    check_in_token: str


class PaymentTransactionCreate(RequestModel):
    """One append-only ledger entry against a booking (#1019).

    There's no ``kind``: a positive ``amount`` is a payment, a negative one
    is a refund — that sign is the only distinction the system needs.
    ``amount != 0`` is validated in ``app.services.payments_service`` rather
    than here, so REST and MCP share one rule. Never edits or deletes a
    prior entry — a refund is always a new row, optionally linked to the
    entry it reverses via ``reversed_transaction_id``.
    """

    amount: Decimal = Field(decimal_places=2, max_digits=10)
    effective_date: dt_date
    """When the money actually moved (e.g. a bank-transfer date), which may
    predate when this entry is recorded."""
    reference: Text200 | None = None
    note: Text2000 | None = None
    reversed_transaction_id: ResourceId | None = None
    idempotency_key: NonEmptyText200 | None = None
    """Client-generated key so a retried/ambiguous submission cannot book or
    refund money twice — see docs/retry-safety.md."""

    @field_validator("reference", "note", mode="before")
    @classmethod
    def strip_optional_text(cls, v: str | None) -> str | None:
        if not isinstance(v, str):
            return v
        stripped = v.strip()
        return stripped or None


class PaymentTransactionOut(BaseModel):
    id: str
    registration_id: str
    amount: Decimal
    effective_date: dt_date
    recorded_at: datetime
    recorded_by: str
    reference: str | None
    note: str | None
    reversed_transaction_id: str | None

    model_config = ConfigDict(from_attributes=True)


class PaymentTransactionLedgerRow(PaymentTransactionOut):
    """One ledger entry with the booking context needed to render an
    edition- or person-level ledger view (#1019), so the admin UI doesn't
    need a round trip per row to resolve which booking/person it belongs to.
    """

    person_name: str
    event_title: str
    edition_label: str


class PaymentTransactionLedgerEnvelope(BaseModel):
    """Paginated response for the edition/person ledger drill-down (#1032),
    mirroring ``RegistrationListEnvelope``: ``total`` counts every row
    matching the current filters, not just this page.
    """

    items: list[PaymentTransactionLedgerRow]
    total: int
    limit: int
    page: int


class RegistrationListOut(BaseModel):
    order_answers: list[OrderAnswerOut] = Field(default_factory=list)
    booked_table_quantity: int = 0
    allocations: list[TableAllocation] = Field(default_factory=list)
    """Registration item returned in the list endpoint.
    check_in_token is intentionally excluded here."""

    id: str
    person_id: str
    person: PersonSummaryOut
    event_id: str
    event: EventOut
    guest_count: int
    order_items: list[OrderItemOut]
    notes: str
    table_id: str | None
    status: RegistrationStatus
    payment_status: PaymentStatus
    amount_due: Decimal | None
    amount_paid: Decimal = Decimal(0)
    refund_due: Decimal | None = Decimal(0)
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RegistrationListEnvelope(BaseModel):
    """Paginated response for the admin registration list.

    ``total`` counts every row matching the current filters, not just this
    page, so a client can tell ``items`` was truncated (e.g. render "showing
    20 of 143 matches") instead of silently rendering a partial result as if
    it were complete.
    """

    items: list[RegistrationListOut]
    total: int
    limit: int
    page: int


class RegistrationGuestOut(BaseModel):
    order_answers: list[OrderAnswerOut] = Field(default_factory=list)
    """Registration data returned to visitors via the self-lookup endpoint."""

    id: str
    name: str
    event_id: str
    event_title: str
    event_date: dt_date | None
    check_in_token: str
    guest_count: int
    order_items: list[OrderItemOut]
    status: RegistrationStatus
    payment_status: PaymentStatus
    amount_due: Decimal | None
    amount_paid: Decimal = Decimal(0)
    refund_due: Decimal | None = Decimal(0)
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MyRegistrationOut(BaseModel):
    """Registration item returned from the authenticated visitor self-service API."""

    id: str
    event_id: str
    event_title: str
    event_date: dt_date | None
    edition_id: str | None
    guest_count: int
    status: RegistrationStatus
    payment_status: PaymentStatus
    checked_in: bool
    checked_in_at: datetime | None
    person_name: str
    created_at: datetime


class PebbleAccessTokenOut(BaseModel):
    token: str


class CommunicationPreferenceOut(BaseModel):
    preferred_language: Literal["nl", "fr", "en"] | None


class CommunicationPreferenceUpdate(RequestModel):
    preferred_language: Literal["nl", "fr", "en"]


class RegistrationLookupRequest(RequestModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def strip_email_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class RegistrationLookupRequestAccepted(BaseModel):
    ok: bool = True
    delivery_mode: Literal["email"] = "email"
    expires_in_minutes: int


class RegistrationAccessLookupRequest(RequestModel):
    token: str = Field(min_length=20)


class VisitorSessionStatus(BaseModel):
    """Whether the caller currently holds a valid visitor session (#953)."""

    authenticated: bool
    expires_at: datetime | None = None


class RegistrationAdminCreate(RegistrationNotesRequest):
    """Admin-only registration creation — skips spam checks, accepts person_id directly."""

    person_id: ResourceId
    event_id: ResourceId
    guest_count: GuestCount
    order_items: list[OrderItemRequest] = Field(default_factory=list, max_length=50)
    notes: Text4000 = ""
    status: RegistrationStatus = "confirmed"

    @field_validator("event_id", "notes", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class VolunteerHelpPeriodIn(RequestModel):
    first_help_day: dt_date
    last_help_day: dt_date | None = None
    notes: Text2000 = ""

    @field_validator("notes", mode="before")
    @classmethod
    def strip_notes(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.last_help_day is not None and self.first_help_day > self.last_help_day:
            raise ValueError("first_help_day must be before or equal to last_help_day.")
        return self


class VolunteerCreate(RequestModel):
    name: NonEmptyText200
    address: Text300 = ""
    national_register_number: Text20 | None = None
    eid_document_number: Text50 | None = None
    help_periods: list[VolunteerHelpPeriodIn] = Field(default_factory=list)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("national_register_number", "eid_document_number", mode="before")
    @classmethod
    def strip_identity(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value


class VolunteerUpdate(RequestModel):
    name: NonEmptyText200 | None = None
    address: Text300 | None = None
    national_register_number: Text20 | None = None
    eid_document_number: Text50 | None = None
    help_periods: list[VolunteerHelpPeriodIn] | None = None
    oidc_subject: str | None = Field(default=None, max_length=255)
    """Admin-only override for the self-service identity link (#1006) — e.g.
    to unlink a mistaken registration (explicit ``null``) or hand-link a
    volunteer who can't or won't complete self-registration themselves.
    Normally established by the volunteer via ``POST /api/me/volunteer/register``."""

    @field_validator("name", "national_register_number", "eid_document_number", "oidc_subject", mode="before")
    @classmethod
    def strip_optional_strings(cls, value: str | None) -> str | None:
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        return stripped or None


class VolunteerPeriodOut(BaseModel):
    id: int
    first_help_day: dt_date
    last_help_day: dt_date | None
    notes: str

    model_config = ConfigDict(from_attributes=True)


class VolunteerOut(BaseModel):
    id: str
    name: str
    address: str
    national_register_number: str | None
    eid_document_number: str | None
    anonymised: bool
    retired_roles: dict[str, str] = {}
    role_history: dict[str, list[RoleStretchOut]] = {}
    help_periods: list[VolunteerPeriodOut]
    oidc_subject: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VolunteerListEnvelope(BaseModel):
    """Paginated response for the admin volunteers list. See ``PersonListEnvelope``."""

    items: list[VolunteerOut]
    total: int
    limit: int
    page: int


# ---------------------------------------------------------------------------
# Volunteer meal/dinner poll
# ---------------------------------------------------------------------------


DietaryTag = Literal["vegetarian", "vegan", "gluten_free", "lactose_free", "contains_nuts"]
"""What a meal suits or contains; the labels are translated in the admin UI and the volunteer page."""

PollQuestionKind = Literal["yes_no", "meals", "single_choice", "free_text", "rating"]
"""Attendance, meal quantities, one configured choice, free text, or a fixed 1–5 rating."""


def _timezone_required(value: datetime | None) -> datetime | None:
    if value and value.utcoffset() is None:
        raise ValueError("closes_at must include a timezone")
    return value


class PollQuestionCreate(PollQuestionTexts):
    edition_id: ResourceKey
    kind: PollQuestionKind
    closes_at: datetime | None = None

    _closes_at_timezone = field_validator("closes_at")(_timezone_required)

    @model_validator(mode="after")
    def check_texts(self) -> Self:
        return self.validate_dutch()


class PollQuestionUpdate(PollQuestionTexts):
    """Partial update: an empty string clears a translation; `closes_at` sets the closing time (a past time
    closes the question now) and an explicit `null` reopens it. The kind cannot change."""

    closes_at: datetime | None = None

    _closes_at_timezone = field_validator("closes_at")(_timezone_required)


class PollQuestionReorder(RequestModel):
    """Every question of an edition, in the order volunteers should see them."""

    edition_id: ResourceKey
    ordered_ids: list[str] = Field(min_length=1, max_length=100)


class PollQuestionCopy(RequestModel):
    """Copy the questions (and their options) of one edition into another; a question whose kind and Dutch
    title already exist there is skipped."""

    from_edition_id: ResourceKey
    to_edition_id: ResourceKey

    @model_validator(mode="after")
    def different_editions(self) -> Self:
        if self.from_edition_id == self.to_edition_id:
            raise ValueError("Choose a different edition to copy from.")
        return self


def _unique_dietary_tags(value: list[DietaryTag] | None) -> list[DietaryTag] | None:
    if value is not None and len(set(value)) != len(value):
        raise ValueError("dietary_tags must not contain duplicates")
    return value


class PollOptionCreate(PollOptionLabels):
    question_id: ResourceId
    dietary_tags: list[DietaryTag] = Field(default_factory=list, max_length=10)

    _unique_tags = field_validator("dietary_tags")(_unique_dietary_tags)

    @model_validator(mode="after")
    def check_label(self) -> Self:
        return self.validate_dutch()


class PollOptionUpdate(PollOptionLabels):
    """Partial update: an empty string clears a translation; `dietary_tags` replaces the whole list."""

    dietary_tags: list[DietaryTag] | None = Field(default=None, max_length=10)

    _unique_tags = field_validator("dietary_tags")(_unique_dietary_tags)


class PollOptionReorder(RequestModel):
    """Every option of an option-bearing question, in the order volunteers should see them."""

    question_id: ResourceId
    ordered_ids: list[str] = Field(min_length=1, max_length=200)


class PollOptionOut(BaseModel):
    """An option as the admin sees it, with how much volunteers asked for in total."""

    id: str
    question_id: str
    edition_id: str
    label: str
    """Resolved for the requested `locale` (Dutch when none)."""
    label_nl: str
    label_fr: str | None = None
    label_en: str | None = None
    dietary_tags: list[DietaryTag] = Field(default_factory=list)
    sort_order: int = 0
    total_quantity: int = 0
    """Sum of every volunteer's quantity — what to order from the caterer."""
    volunteer_count: int = 0
    created_at: datetime
    updated_at: datetime


class PollQuestionOut(BaseModel):
    """A question as the admin sees it: every translation, the closing state, its options (meals/single choice) and what
    volunteers answered so far."""

    id: str
    edition_id: str
    kind: PollQuestionKind
    title: str
    """Resolved for the requested `locale` (Dutch when none)."""
    title_nl: str
    title_fr: str | None = None
    title_en: str | None = None
    description: str = ""
    description_nl: str | None = None
    description_fr: str | None = None
    description_en: str | None = None
    sort_order: int = 0
    closes_at: datetime | None = None
    closed: bool = False
    options: list[PollOptionOut] = Field(default_factory=list)
    answered_count: int = 0
    """Volunteers who answered: a pick for a meals question, a yes or no for a yes/no question."""
    yes_count: int = 0
    no_count: int = 0
    people_total: int = 0
    """The number of people the "yes" answers stand for (yes/no questions)."""
    created_at: datetime
    updated_at: datetime


class PollSelectionItem(RequestModel):
    option_id: ResourceId
    quantity: int = Field(ge=1, le=MAX_POLL_QUANTITY)


class PollAttendanceItem(RequestModel):
    """One volunteer's answer to a yes/no question: `people` counts everyone a "yes" stands for
    (the volunteer included) and is 0 for a "no"."""

    question_id: ResourceId
    attending: bool
    people: int = Field(default=1, ge=0, le=MAX_POLL_PEOPLE)

    @model_validator(mode="after")
    def people_match_the_answer(self) -> Self:
        if self.attending and self.people < 1:
            raise ValueError("A yes needs at least one person.")
        if not self.attending:
            self.people = 0
        return self


class PollChoiceItem(RequestModel):
    question_id: ResourceId
    option_id: ResourceId


class PollTextItem(RequestModel):
    question_id: ResourceId
    text: Text500

    @field_validator("text")
    @classmethod
    def nonempty_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Text must not be blank.")
        return value.strip()


class PollRatingItem(RequestModel):
    question_id: ResourceId
    rating: int = Field(ge=1, le=5, strict=True)


class PollOrderOptionOut(BaseModel):
    id: str
    label: str
    dietary_tags: list[DietaryTag] = Field(default_factory=list)


class PollOrderQuestionOut(BaseModel):
    id: str
    kind: PollQuestionKind
    title: str
    closed: bool = False
    options: list[PollOrderOptionOut] = Field(default_factory=list)
    answered_count: int = 0
    yes_count: int = 0
    no_count: int = 0
    people_total: int = 0


class PollVolunteerOrderOut(BaseModel):
    volunteer_id: str
    name: str
    note: str | None
    answered_question_ids: list[str]
    selections: list[PollSelectionItem]
    attendance: list[PollAttendanceItem]
    choices: list[PollChoiceItem] = Field(default_factory=list)
    texts: list[PollTextItem] = Field(default_factory=list)
    ratings: list[PollRatingItem] = Field(default_factory=list)


class PollOrdersOut(BaseModel):
    """Who answered what: every active volunteer (also those who have not answered yet) and anyone else
    holding an answer, next to the questions in display order."""

    edition_id: str
    questions: list[PollOrderQuestionOut]
    volunteers: list[PollVolunteerOrderOut]
    volunteer_count: int


class AdminPollOrderIn(RequestModel):
    """An admin entering or correcting a volunteer's answers (for example from an email): a full replace of
    their meal picks (`selections`), yes/no answers (`attendance`), `choices`, `texts` and `ratings` for the edition.
    `note` omitted keeps their dietary note, an empty string clears it. `confirm_closed` must be true when
    the change touches a question that has closed."""

    selections: list[PollSelectionItem] = Field(default_factory=list, max_length=100)
    attendance: list[PollAttendanceItem] = Field(default_factory=list, max_length=100)
    choices: list[PollChoiceItem] = Field(default_factory=list, max_length=100)
    texts: list[PollTextItem] = Field(default_factory=list, max_length=100)
    ratings: list[PollRatingItem] = Field(default_factory=list, max_length=100)
    note: Text500 | None = None
    confirm_closed: bool = False

    @model_validator(mode="after")
    def reject_duplicates(self) -> Self:
        option_ids = [selection.option_id for selection in self.selections]
        question_ids = [
            item.question_id for items in (self.attendance, self.choices, self.texts, self.ratings) for item in items
        ]
        if len(option_ids) != len(set(option_ids)) or len(question_ids) != len(set(question_ids)):
            raise ValueError("Each option and each question can be listed only once.")
        return self


class VolunteerPollAnswerIn(RequestModel):
    """A volunteer's answer to one question: `selections` (quantity per option, replacing their picks for
    that question) for meals, `attending` (and `people`, default 1) for yes/no, `option_id` for single choice,
    `text` (at most 500 characters) for free text, or `rating` (integer 1–5). Explicit null clears a scalar answer."""

    option_id: ResourceId | None = None
    text: Text500 | None = None
    rating: int | None = Field(default=None, ge=1, le=5, strict=True)
    selections: list[PollSelectionItem] | None = Field(default=None, max_length=100)
    attending: bool | None = None
    people: int | None = Field(default=None, ge=0, le=MAX_POLL_PEOPLE)

    @model_validator(mode="after")
    def reject_duplicate_options(self) -> Self:
        ids = [selection.option_id for selection in self.selections or []]
        if len(ids) != len(set(ids)):
            raise ValueError("Each option can be listed only once.")
        return self


class VolunteerPollNoteIn(RequestModel):
    """The volunteer's dietary note for the edition's meals; an empty string clears it."""

    note: Text500


class VolunteerPollOptionOut(BaseModel):
    id: str
    label: str
    """Resolved for the requested `locale` (Dutch when that language has no label)."""
    dietary_tags: list[DietaryTag] = Field(default_factory=list)


class VolunteerPollQuestionOut(BaseModel):
    id: str
    kind: PollQuestionKind
    title: str
    description: str = ""
    closes_at: datetime | None = None
    closed: bool = False
    options: list[VolunteerPollOptionOut] = Field(default_factory=list)
    selections: list[PollSelectionItem] = Field(default_factory=list)
    attending: bool | None = None
    """The answer to a yes/no question; `None` while unanswered."""
    people: int = 0
    option_id: str | None = None
    text: str | None = None
    rating: int | None = None


class VolunteerPollOut(BaseModel):
    """What a volunteer sees: the active festival edition's questions (empty if none) with their own
    answers, and their dietary note."""

    edition_id: str | None
    questions: list[VolunteerPollQuestionOut]
    note: str | None = None


# ---------------------------------------------------------------------------
# Check-in
# ---------------------------------------------------------------------------


class CheckInGuestOut(BaseModel):
    """Minimal registration data returned by the public check-in GET endpoint.

    Only exposes fields needed on the volunteer tablet — guest name, party size,
    event info, order items, arrival notes, and check-in/strap status.
    PII fields (email, phone) and internal-only fields (payment_status, table_id,
    timestamps) are omitted.
    """

    id: str
    name: str
    event_id: str
    edition_id: str | None = None
    event_title: str
    table_id: str | None = None
    table_name: str | None = None
    guest_count: int
    order_items: list[OrderItemOut]
    notes: str
    status: RegistrationStatus
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool

    model_config = ConfigDict(from_attributes=True)


class CheckInLookupRequest(RequestModel):
    token: str


class CheckInRequest(RequestModel):
    token: str
    issue_strap: bool = True


class CheckInOut(BaseModel):
    stamp_progress: StampProgress | None = None
    registration: CheckInGuestOut
    already_checked_in: bool


class VolunteerCheckInRequest(RequestModel):
    issue_strap: bool = True


class VolunteerRegistrationUpdate(RequestModel):
    order_items: list[RegistrationDeliveryUpdate] | None = Field(default=None, max_length=50)
    strap_issued: bool | None = None


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------


class PersonCreate(RequestModel):
    name: NonEmptyText200
    email: EmailStr | None = None
    phone: Text50 = ""
    preferred_language: Literal["nl", "fr", "en"] | None = None
    address: Text300 = ""
    roles: list[str] = Field(default_factory=list)
    national_register_number: Text20 | None = None
    eid_document_number: Text50 | None = None
    visits_per_month: MonthlyVisits | None = None
    notes: Text2000 = ""
    inactivity_exempt: bool = False
    inactivity_exempt_note: Text2000 = ""
    member_since: dt_date | None = None
    """Member endpoints only: the day membership started (defaults to today for a new member)."""


class PersonUpdate(RequestModel):
    name: NonEmptyText200 | None = None
    email: EmailStr | None = None
    phone: Text50 | None = None
    preferred_language: Literal["nl", "fr", "en"] | None = None
    address: Text300 | None = None
    roles: list[str] | None = None
    national_register_number: Text20 | None = None
    eid_document_number: Text50 | None = None
    visits_per_month: MonthlyVisits | None = None
    notes: Text2000 | None = None
    inactivity_exempt: bool | None = None
    inactivity_exempt_note: Text2000 | None = None
    member_since: dt_date | None = None
    """Member endpoints only: the day the current stretch of membership started."""
    marketing_opt_in: bool | None = None
    """Admin-initiated correction only (e.g. processing an opt-out request
    received through the contact form) — the registration form is the actual
    consent channel; this is not exposed there."""


# ---------------------------------------------------------------------------
# Organizations
# ---------------------------------------------------------------------------


class OrganizationDescription(RequestModel):
    description_nl: Text600 | None = None
    description_fr: Text600 | None = None
    description_en: Text600 | None = None

    @field_validator("description_nl", "description_fr", "description_en", mode="before")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if any((self.description_fr, self.description_en)) and not self.description_nl:
            raise ValueError("A description requires non-empty Dutch text.")
        return self


class OrganizationCreate(OrganizationDescription):
    name: NonEmptyText200
    image: Text500 = ""
    website: Text500 = ""
    active: bool = True
    type: Literal["producer", "sponsor", "vendor"] = "vendor"
    contact_person_id: str | None = None

    @model_validator(mode="after")
    def check_description(self) -> Self:
        return self.validate_dutch()


class OrganizationUpdate(OrganizationDescription):
    name: NonEmptyText200 | None = None
    image: Text500 | None = None
    website: Text500 | None = None
    active: bool | None = None
    type: Literal["producer", "sponsor", "vendor"] | None = None
    contact_person_id: str | None = None


class OrganizationOut(BaseModel):
    description_nl: str | None = None
    description_fr: str | None = None
    description_en: str | None = None
    id: int
    name: str
    image: str
    website: str
    active: bool
    type: str
    contact_person_id: str | None
    contact_person: PersonSummaryOut | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Layouts
# ---------------------------------------------------------------------------


class LayoutCreate(RequestModel):
    event_id: ResourceId
    room_id: ResourceId
    label: Text200 = ""


class LayoutCopyCreate(LayoutCreate):
    copy_tables: bool = True
    copy_areas: bool = True


class LayoutOut(BaseModel):
    event_id: str
    event_title: str
    id: str
    edition_id: str | None
    room_id: str
    date: dt_date | None
    label: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LayoutBulkCreate(RequestModel):
    """Create several layouts in one atomic transaction (#837).

    All items are validated and, within the batch, checked against each other
    for the same room+event duplication ``create_layout`` already
    rejects — a failure partway through leaves no layout created. Pass
    ``idempotency_key`` to safely retry after a timeout or partial failure
    without risking duplicates.
    """

    items: list[LayoutCreate] = Field(min_length=1, max_length=200)
    idempotency_key: NonEmptyText200 | None = None


class LayoutBulkOut(BaseModel):
    items: list[LayoutOut]


# ---------------------------------------------------------------------------
# Table types
# ---------------------------------------------------------------------------


class TableTypeCreate(RequestModel):
    name: NonEmptyText200
    venue_id: str
    shape: Literal["rectangle", "round"] = "rectangle"
    # No defensible default exists for physical dimensions (unlike shape/height_type,
    # which have a legitimate industry-standard default) — required so a caller can't
    # silently persist a 0.7 x 1.8m table type without realising it (see #835).
    width_m: TableDimension
    length_m: TableDimension
    height_type: Literal["low", "high"] = "low"
    capacity: TableCapacity
    active: bool = True

    @model_validator(mode="after")
    def normalise_dimensions(self) -> Self:
        from app.utils import normalise_table_type_dimensions

        self.width_m, self.length_m = normalise_table_type_dimensions(self.shape, self.width_m, self.length_m)
        return self


class TableTypeUpdate(RequestModel):
    name: NonEmptyText200 | None = None
    venue_id: str | None = None
    shape: Literal["rectangle", "round"] | None = None
    width_m: TableDimension | None = None
    length_m: TableDimension | None = None
    height_type: Literal["low", "high"] | None = None
    capacity: TableCapacity | None = None
    active: bool | None = None


class TableTypeOut(BaseModel):
    id: str
    name: str
    venue_id: str
    shape: str
    width_m: float
    length_m: float
    height_type: str
    capacity: int
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TableTypeBulkCreate(RequestModel):
    """Create several table types in one atomic transaction (#837).

    A failure partway through (e.g. an unknown ``venue_id`` on any item)
    leaves no table type created. Pass ``idempotency_key`` to safely retry
    after a timeout or partial failure without risking duplicates.
    """

    items: list[TableTypeCreate] = Field(min_length=1, max_length=200)
    idempotency_key: NonEmptyText200 | None = None


class TableTypeBulkOut(BaseModel):
    items: list[TableTypeOut]


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


# x/y/rotation semantics (percentage of the layout's rendered canvas, top-left
# origin, clockwise degrees) are shared by Table and Area — see
# docs/floor-plan-coordinates.md for the full contract, including why the
# canvas isn't a 1:1 percentage of the room's physical width_m/length_m.
# Public (no leading underscore) so app.mcp_server can reuse the same text for
# the MCP tool parameter schemas (see create_table/update_table/create_area/
# update_area there), keeping the wording identical across REST and MCP.
X_POSITION_DESCRIPTION = (
    "Horizontal position: percentage [0, 100] of the layout's rendered canvas width, "
    "from the left edge. See docs/floor-plan-coordinates.md."
)
Y_POSITION_DESCRIPTION = (
    "Vertical position: percentage [0, 100] of the layout's rendered canvas height, "
    "from the top edge. See docs/floor-plan-coordinates.md."
)
ROTATION_DESCRIPTION = "Clockwise rotation in whole degrees [0, 359], pivoting around this element's own center."


class TableCreate(RequestModel):
    name: NonEmptyText200
    x: FloorPlanPosition = Field(default=50.0, description=X_POSITION_DESCRIPTION)
    y: FloorPlanPosition = Field(default=50.0, description=Y_POSITION_DESCRIPTION)
    table_type_id: str
    rotation: FloorPlanRotation = Field(default=0, description=ROTATION_DESCRIPTION)
    layout_id: str


class TableUpdate(RequestModel):
    name: NonEmptyText200 | None = None
    x: FloorPlanPosition | None = Field(default=None, description=X_POSITION_DESCRIPTION)
    y: FloorPlanPosition | None = Field(default=None, description=Y_POSITION_DESCRIPTION)
    table_type_id: str | None = None
    rotation: FloorPlanRotation | None = Field(default=None, description=ROTATION_DESCRIPTION)
    layout_id: str | None = None


class TableOut(BaseModel):
    event_id: str
    id: str
    name: str
    capacity: int
    x: float
    y: float
    table_type_id: str
    rotation: int
    layout_id: str
    registration_ids: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TableBulkCreate(RequestModel):
    """Create several tables in one atomic transaction (#837).

    A failure partway through (e.g. an unknown ``table_type_id`` or
    ``layout_id`` on any item) leaves no table created. Pass
    ``idempotency_key`` to safely retry after a timeout or partial failure
    without risking duplicates.
    """

    items: list[TableCreate] = Field(min_length=1, max_length=200)
    idempotency_key: NonEmptyText200 | None = None


class TableBulkOut(BaseModel):
    items: list[TableOut]


# ---------------------------------------------------------------------------
# Areas
# ---------------------------------------------------------------------------


class AreaCreate(RequestModel):
    layout_id: str = Field(max_length=64)
    label: NonEmptyText200
    icon: Text50 = "bi-shop"
    organization_id: int | None = None
    width_m: AreaDimension = 1.5
    length_m: AreaDimension = 1.0
    x: FloorPlanPosition = Field(default=50.0, description=X_POSITION_DESCRIPTION)
    y: FloorPlanPosition = Field(default=50.0, description=Y_POSITION_DESCRIPTION)
    rotation: FloorPlanRotation = Field(default=0, description=ROTATION_DESCRIPTION)


class AreaUpdate(RequestModel):
    label: NonEmptyText200 | None = None
    icon: Text50 | None = None
    organization_id: int | None = None
    width_m: AreaDimension | None = None
    length_m: AreaDimension | None = None
    x: FloorPlanPosition | None = Field(default=None, description=X_POSITION_DESCRIPTION)
    y: FloorPlanPosition | None = Field(default=None, description=Y_POSITION_DESCRIPTION)
    rotation: FloorPlanRotation | None = Field(default=None, description=ROTATION_DESCRIPTION)


class AreaOut(BaseModel):
    id: str
    layout_id: str
    icon: str
    organization_id: int | None
    label: str
    x: float
    y: float
    rotation: int
    width_m: float
    length_m: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LayoutWithTablesOut(LayoutOut):
    """``LayoutOut`` plus its tables/areas, returned by ``GET /api/layouts/{id}``
    when ``include_tables=true`` is passed (or the MCP ``get_layout`` tool's
    ``include_tables`` argument). ``tables``/``areas`` are ``None`` unless
    requested, so a scoped single-layout read no longer requires a separate
    global ``list_tables``/``list_areas`` scan and client-side join.
    """

    tables: list[TableOut] | None = None
    areas: list[AreaOut] | None = None


# ---------------------------------------------------------------------------
# Layout revisions (#1021)
# ---------------------------------------------------------------------------

# The reserved "current" ref lets compare/restore-preview treat the live
# arrangement as one more revision without a separate endpoint — see
# app.services.layouts_service.compare_layout_revisions.
CURRENT_REVISION_REF = "current"


class LayoutRevisionSnapshotTable(BaseModel):
    """One table's stable identity and geometry, captured at save-revision time.

    ``id`` is the source ``Table.id`` — the stable identity compare/restore
    match on, never the mutable ``name``.
    """

    id: str
    name: str
    x: float = Field(description=X_POSITION_DESCRIPTION)
    y: float = Field(description=Y_POSITION_DESCRIPTION)
    rotation: int = Field(description=ROTATION_DESCRIPTION)
    table_type_id: str
    table_type_name: str
    capacity: int
    width_m: float
    length_m: float


class LayoutRevisionSnapshotArea(BaseModel):
    """One area's stable identity and geometry, captured at save-revision time.

    ``id`` is the source ``Area.id`` — the stable identity compare/restore
    match on, never the mutable ``label``. Deliberately excludes
    ``organization_id``: allocations are live operational data, not part of any
    revision (see ``LayoutRevisionSnapshot``).
    """

    id: str
    label: str
    icon: str
    x: float = Field(description=X_POSITION_DESCRIPTION)
    y: float = Field(description=Y_POSITION_DESCRIPTION)
    rotation: int = Field(description=ROTATION_DESCRIPTION)
    width_m: float
    length_m: float


class LayoutRevisionSnapshotRoom(BaseModel):
    width_m: float
    length_m: float


class LayoutRevisionSnapshot(BaseModel):
    """A geometry-only snapshot of a layout's tables and areas.

    Excludes allocations (``Registration``/``RegistrationAllocation``) and
    area ``organization_id`` — those remain live operational data outside any
    revision's scope (#1021 acceptance criteria).
    """

    tables: list[LayoutRevisionSnapshotTable]
    areas: list[LayoutRevisionSnapshotArea]
    room: LayoutRevisionSnapshotRoom


class LayoutRevisionOut(BaseModel):
    id: str
    layout_id: str
    revision_number: int
    label: str
    change_note: str | None
    created_by: str
    created_at: datetime
    snapshot: LayoutRevisionSnapshot

    model_config = ConfigDict(from_attributes=True)


class LayoutRevisionSummaryOut(BaseModel):
    """Lightweight revision listing shape, without the (potentially large) snapshot."""

    id: str
    layout_id: str
    revision_number: int
    label: str
    change_note: str | None
    created_by: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LayoutRevisionSaveRequest(RequestModel):
    label: NonEmptyText200
    change_note: Text2000 | None = None

    @field_validator("label", mode="before")
    @classmethod
    def strip_label(cls, value: str) -> str:
        # Stripped before min_length is enforced so a whitespace-only label
        # (e.g. "   ") is rejected rather than silently persisted as "".
        return value.strip() if isinstance(value, str) else value


class LayoutRevisionFieldChange(BaseModel):
    field: str
    before: Any
    after: Any


class LayoutRevisionTableChange(BaseModel):
    id: str
    before: LayoutRevisionSnapshotTable
    after: LayoutRevisionSnapshotTable
    changes: list[LayoutRevisionFieldChange]


class LayoutRevisionAreaChange(BaseModel):
    id: str
    before: LayoutRevisionSnapshotArea
    after: LayoutRevisionSnapshotArea
    changes: list[LayoutRevisionFieldChange]


class LayoutRevisionDiff(BaseModel):
    """Result of comparing two snapshots (each a revision or the live ``current``
    draft), matching tables/areas by stable ``id`` rather than name/label."""

    layout_id: str
    from_ref: str
    to_ref: str
    added_tables: list[LayoutRevisionSnapshotTable] = Field(default_factory=list)
    removed_tables: list[LayoutRevisionSnapshotTable] = Field(default_factory=list)
    changed_tables: list[LayoutRevisionTableChange] = Field(default_factory=list)
    added_areas: list[LayoutRevisionSnapshotArea] = Field(default_factory=list)
    removed_areas: list[LayoutRevisionSnapshotArea] = Field(default_factory=list)
    changed_areas: list[LayoutRevisionAreaChange] = Field(default_factory=list)


class LayoutRestoreAllocationConflict(BaseModel):
    """One live allocation that would be silently invalidated by a restore.

    Restoring never touches ``Registration``/``Area.organization_id`` itself —
    this only flags that the *geometry* change (delete/move) would orphan an
    existing allocation, so the caller can make a deliberate call via
    ``LayoutRestoreRequest.resolve_allocations``.
    """

    kind: Literal["table", "area"]
    id: str
    name: str
    reason: Literal["deleted", "moved"]
    registration_ids: list[str] = Field(default_factory=list)
    organization_id: int | None = None


class LayoutRestorePreview(BaseModel):
    layout_id: str
    revision_number: int
    tables_to_add: list[LayoutRevisionSnapshotTable] = Field(default_factory=list)
    tables_to_update: list[LayoutRevisionTableChange] = Field(default_factory=list)
    tables_to_remove: list[LayoutRevisionSnapshotTable] = Field(default_factory=list)
    areas_to_add: list[LayoutRevisionSnapshotArea] = Field(default_factory=list)
    areas_to_update: list[LayoutRevisionAreaChange] = Field(default_factory=list)
    areas_to_remove: list[LayoutRevisionSnapshotArea] = Field(default_factory=list)
    allocation_conflicts: list[LayoutRestoreAllocationConflict] = Field(default_factory=list)
    has_conflicts: bool = False


class LayoutRestoreRequest(RequestModel):
    resolve_allocations: bool = False


class VenuePlanRoomOut(BaseModel):
    id: str
    name: str
    width_m: float
    length_m: float
    color: str


class VenuePlanTableOut(BaseModel):
    exclusive: bool = False
    id: str
    name: str
    capacity: int
    x: float
    y: float
    rotation: int
    table_type_id: str
    registration_ids: list[str]
    occupied_seats: int


class VenuePlanAreaOut(BaseModel):
    id: str
    label: str
    icon: str
    x: float
    y: float
    rotation: int
    width_m: float
    length_m: float
    organization_id: int | None


class VenuePlanLayoutOut(BaseModel):
    event_title: str
    id: str
    event_id: str
    date: dt_date | None
    label: str
    room: VenuePlanRoomOut | None
    tables: list[VenuePlanTableOut]
    areas: list[VenuePlanAreaOut]


class VenuePlanOut(BaseModel):
    edition_id: str
    layouts: list[VenuePlanLayoutOut]


# ---------------------------------------------------------------------------
# Venues
# ---------------------------------------------------------------------------


class VenueCreate(RequestModel):
    name: NonEmptyText200
    address: Text200 = ""
    city: Text100 = ""
    postal_code: Text20 = ""
    country: Text100 = ""
    lat: float = 0.0
    lng: float = 0.0
    active: bool = True


class VenueUpdate(RequestModel):
    name: NonEmptyText200 | None = None
    address: Text200 | None = None
    city: Text100 | None = None
    postal_code: Text20 | None = None
    country: Text100 | None = None
    lat: float | None = None
    lng: float | None = None
    active: bool | None = None


class VenueOut(BaseModel):
    id: str
    name: str
    address: str
    city: str
    postal_code: str
    country: str
    lat: float
    lng: float
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------


class RoomCreate(RequestModel):
    venue_id: str
    name: NonEmptyText200
    # Required, not defaulted — a 20x15m default would silently masquerade as a
    # measured room dimension for whatever venue was actually entered (see #835).
    width_m: RoomDimension
    length_m: RoomDimension
    color: HexColor = "#6c757d"
    active: bool = True


class RoomUpdate(RequestModel):
    venue_id: str | None = None
    name: NonEmptyText200 | None = None
    width_m: RoomDimension | None = None
    length_m: RoomDimension | None = None
    color: HexColor | None = None
    active: bool | None = None


class RoomOut(BaseModel):
    id: str
    venue_id: str
    name: str
    width_m: float
    length_m: float
    color: str
    active: bool
    dimensions_placeholder: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoomBulkCreate(RequestModel):
    """Create several rooms in one atomic transaction (#837).

    A failure partway through (e.g. an unknown ``venue_id`` on any item)
    leaves no room created. Pass ``idempotency_key`` to safely retry after a
    timeout or partial failure without risking duplicates.
    """

    items: list[RoomCreate] = Field(min_length=1, max_length=200)
    idempotency_key: NonEmptyText200 | None = None


class RoomBulkOut(BaseModel):
    items: list[RoomOut]


# ---------------------------------------------------------------------------
# Editions
# ---------------------------------------------------------------------------


class EditionCreate(RequestModel):
    id: ResourceKey
    year: EditionYear
    month: str
    venue_id: str
    edition_type: EditionType = "festival"
    organizations: list[int] = Field(default_factory=list)
    sponsor_tiers: dict[int, SponsorTier] = Field(
        default_factory=dict,
        description="Sponsor level per lineup sponsor (organization id -> tier); sponsors without one are untiered.",
    )
    co_organizer_organization_id: int | None = None
    active: bool = True


class EditionUpdate(RequestModel):
    year: EditionYear | None = None
    month: str | None = None
    venue_id: str | None = None
    edition_type: EditionType | None = None
    organizations: list[int] | None = None
    sponsor_tiers: dict[int, SponsorTier] | None = Field(
        default=None,
        description=(
            "Replaces the sponsor levels when given. When omitted, existing levels are kept for sponsors "
            "that stay in the lineup."
        ),
    )
    co_organizer_organization_id: int | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def reject_null_active_and_edition_type(self) -> Self:
        for field in ("edition_type", "active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} may be omitted but cannot be null.")
        return self


class EditionItemOut(BaseModel):
    """Slim organization shape embedded in the public edition response.
    Only active items are included; contact person and active flag are
    intentionally excluded — they are internal admin data."""

    description_nl: str | None = None
    description_fr: str | None = None
    description_en: str | None = None
    id: int
    name: str
    image: str
    website: str
    type: str
    sponsor_tier: SponsorTier | None = Field(
        default=None, description="Sponsor level for this edition; null for non-sponsors and untiered sponsors."
    )

    model_config = ConfigDict(from_attributes=True)


class EditionOut(BaseModel):
    id: str
    year: int
    month: str
    edition_type: EditionType
    dates: list[dt_date] = Field(default_factory=list)
    venue: VenueOut
    events: list[EventOut]
    organizations: list[int] = Field(
        default_factory=list, description="The lineup organization ids in admin-defined order."
    )
    producers: list[EditionItemOut]
    sponsors: list[EditionItemOut] = Field(description="Ordered by sponsor tier (main first), then lineup order.")
    vendors: list[EditionItemOut]
    co_organizer: EditionItemOut | None = None
    flyer_image: str | None = Field(default=None, description="Uploaded flyer path, or null for the static default.")
    hero_image: str | None = Field(
        default=None, description="Uploaded hero photo path, or null for the static default."
    )
    share_image: str | None = Field(
        default=None, description="Uploaded 1200x630 sharing image path (`og:image`), or null for the default."
    )
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EditionPublicOut(BaseModel):
    """Returned by the unauthenticated /api/editions/active and /upcoming
    endpoints — events carry EventPublicOut, never the admin product shape."""

    id: str
    year: int
    month: str
    edition_type: EditionType
    dates: list[dt_date] = Field(default_factory=list)
    venue: VenueOut
    events: list[EventPublicOut]
    producers: list[EditionItemOut]
    sponsors: list[EditionItemOut] = Field(description="Ordered by sponsor tier (main first), then lineup order.")
    vendors: list[EditionItemOut]
    co_organizer: EditionItemOut | None = None
    flyer_image: str | None = Field(default=None, description="Uploaded flyer path, or null for the static default.")
    hero_image: str | None = Field(
        default=None, description="Uploaded hero photo path, or null for the static default."
    )
    share_image: str | None = Field(
        default=None, description="Uploaded 1200x630 sharing image path (`og:image`), or null for the default."
    )
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StandOut(BaseModel):
    """One stand of one organization on one festival day (public subset of an ``Area``).

    Deliberately carries no coordinates, size, icon or layout/area ids: the
    public list answers "where is X?" by label, room and day only.
    """

    event_id: str
    date: dt_date
    room_name: str
    label: str


class OrganizationStandsOut(BaseModel):
    organization_id: int
    name: str
    stands: list[StandOut]


class EditionStandsOut(BaseModel):
    """Returned by the unauthenticated ``GET /api/editions/{id}/stands``.

    Only lineup organizations that have at least one stand appear; there are no
    tables, registrations, guests, capacities or allocations in this shape.
    """

    edition_id: str
    organizations: list[OrganizationStandsOut]


class PlanAreaOut(BaseModel):
    """One area (stand, stage, entrance, catering, ...) of the public floor plan.

    Geometry follows ``docs/floor-plan-coordinates.md``. Deliberately has no layout id.
    """

    id: str
    label: str
    icon: str
    x: float
    y: float
    rotation: int
    width_m: float
    length_m: float
    organization_id: int | None


class PlanRoomOut(BaseModel):
    id: str
    name: str
    width_m: float
    length_m: float
    color: str
    areas: list[PlanAreaOut]


class PlanDayOut(BaseModel):
    event_id: str
    date: dt_date
    rooms: list[PlanRoomOut]


class EditionPlanOut(BaseModel):
    """Returned by the unauthenticated ``GET /api/editions/{id}/plan`` (#1253).

    Only rooms and areas: there are no tables, registrations, guests, capacities
    or allocations in this shape.
    """

    edition_id: str
    days: list[PlanDayOut]


class EditionScratchpadUpdate(RequestModel):
    content: str = Field(max_length=20000)


class EditionScratchpadOut(BaseModel):
    content: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditEntryOut(BaseModel):
    id: str
    timestamp: datetime
    actor: str
    auth_source: str
    subject: str | None
    integration_client_id: str | None
    action: str
    resource_type: str
    resource_id: str
    request_id: str | None
    details: dict

    model_config = ConfigDict(from_attributes=True)


class IntegrationClientCreate(RequestModel):
    name: str = Field(min_length=1, max_length=120)
    allowed_role: Literal["admin", "volunteer"]
    """Fixed at creation; never more privileged than the creating admin's own tier
    (in practice always 'admin' here, since only admins can call this)."""
    rate_limit_per_minute: int = Field(default=120, ge=1, le=6000)


class IntegrationClientOut(BaseModel):
    """Admin listing/detail shape — never includes the key hash or raw key."""

    id: str
    name: str
    key_preview: str
    allowed_role: str
    created_by_actor: str
    rate_limit_per_minute: int
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class IntegrationClientCreatedOut(IntegrationClientOut):
    """Returned only from create/rotate: carries the one-time raw key.

    The raw key is never stored and never retrievable again after this
    response — only its hash persists.
    """

    key: str


class AppSettingsUpdate(RequestModel):
    member_limit: MemberLimit | None = None
    member_inactivity_months: MemberInactivityMonths | None = None

    stamp_card_type_id: ResourceId | None = None
    maintenance_mode: bool | None = None
    public_email: EmailStr | Literal[""] | None = None
    public_phone: Text30 | None = None
    facebook_url: Text500 | None = None

    @field_validator("public_phone")
    @classmethod
    def validate_public_phone(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        if (
            not value.startswith("+")
            or value.count("+") != 1
            or not all(character.isdigit() or character in " +()-" for character in value)
        ):
            raise ValueError("public_phone must be empty or a valid international telephone number")
        digit_count = sum(character.isdigit() for character in value)
        if digit_count < 7:
            raise ValueError("public_phone must contain at least 7 digits")
        return value

    @field_validator("facebook_url")
    @classmethod
    def validate_facebook_url(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname:
            raise ValueError("facebook_url must be empty or use HTTPS")
        return value


class AppSettingsOut(BaseModel):
    member_limit: int | None = None
    member_inactivity_months: int | None = None

    stamp_card_type_id: str | None = None
    maintenance_mode: bool
    public_email: str
    public_phone: str
    facebook_url: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FaqTextFields(RequestModel):
    """A question and its answer per language (#1222): Dutch must have both, the
    others are optional, and a language is shown only when both its question and
    answer have text. A blank text is stored as `None`."""

    question_nl: Text500 | None = None
    question_fr: Text500 | None = None
    question_en: Text500 | None = None
    answer_nl: Text10000 | None = None
    answer_fr: Text10000 | None = None
    answer_en: Text10000 | None = None

    @field_validator("question_nl", "question_fr", "question_en", "answer_nl", "answer_fr", "answer_en", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.question_nl or not self.answer_nl:
            raise ValueError("A FAQ item requires a Dutch question and a Dutch answer.")
        return self


class FaqItemCreate(FaqTextFields):
    active: bool = True

    @model_validator(mode="after")
    def check_text(self) -> Self:
        return self.validate_dutch()


class FaqItemUpdate(FaqTextFields):
    """Partial update: an empty string clears a translation, the Dutch text cannot be cleared."""

    active: bool | None = None


class FaqItemReorder(RequestModel):
    """The complete, ordered list of every existing FAQ item's ID.

    `sort_order` isn't settable through create/update — this is the only way
    to change display order, and it takes the whole collection at once so a
    reorder can't leave things ambiguous or race another admin's reorder (#836).
    """

    ordered_ids: list[str] = Field(min_length=1)


class FaqItemOut(BaseModel):
    """Admin shape: every language's content, for the FAQ editor."""

    id: str
    question_nl: str | None
    question_fr: str | None
    question_en: str | None
    answer_nl: str | None
    answer_fr: str | None
    answer_en: str | None
    sort_order: int
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FaqItemPublicOut(BaseModel):
    """Public shape: one locale's question/answer, already resolved server-side
    (Dutch when that locale is not fully translated)."""

    id: str
    question: str
    answer: str


_BLANK_TO_NONE = ("text_nl", "text_fr", "text_en", "link_label_nl", "link_label_fr", "link_label_en")


class _AnnouncementFields[LevelT: AnnouncementLevel | None, ActiveT: bool | None](RequestModel):
    """Announcement text and link label per language (#1222): Dutch must have the
    text (and the link label when there is a link), the others are optional
    translations, and visitors fall back to Dutch."""

    text_nl: Text500 | None = None
    text_fr: Text500 | None = None
    text_en: Text500 | None = None
    level: LevelT
    active: ActiveT
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    link_url: Text1000 | None = None
    link_label_nl: Text120 | None = None
    link_label_fr: Text120 | None = None
    link_label_en: Text120 | None = None

    _safe_link_url = field_validator("link_url")(_validate_safe_announcement_url)

    @field_validator(*_BLANK_TO_NONE, mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("starts_at", "ends_at")
    @classmethod
    def timezone_required(cls, value: datetime | None) -> datetime | None:
        if value and value.utcoffset() is None:
            raise ValueError("announcement timestamps must include a timezone")
        return value


class AnnouncementFields(_AnnouncementFields[AnnouncementLevel | None, bool | None]):
    """Announcement text and link label per language (#1222): Dutch must have the
    text (and the link label when there is a link), the others are optional
    translations, and visitors fall back to Dutch."""

    level: AnnouncementLevel | None = None
    active: bool | None = None


class AnnouncementWrite(_AnnouncementFields[AnnouncementLevel, bool]):
    """The complete, validated state of an announcement (create body, and what an update merges into)."""

    level: AnnouncementLevel = "info"
    active: bool = False

    @model_validator(mode="after")
    def validate_announcement(self):
        if not self.text_nl:
            raise ValueError("an announcement needs Dutch text")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        if self.link_url and not self.link_label_nl:
            raise ValueError("a link URL requires a Dutch link label")
        return self


class AnnouncementCreate(AnnouncementWrite):
    pass


class AnnouncementUpdate(AnnouncementFields):
    """Partial update: an empty string clears a translation; the merged result is validated."""


class AnnouncementReorder(RequestModel):
    ordered_ids: list[str] = Field(min_length=1)


class AnnouncementOut(BaseModel):
    id: str
    text_nl: str | None
    text_fr: str | None
    text_en: str | None
    level: AnnouncementLevel
    active: bool
    sort_order: int
    starts_at: datetime | None
    ends_at: datetime | None
    link_url: str | None
    link_label_nl: str | None
    link_label_en: str | None
    link_label_fr: str | None
    published_at: datetime | None
    published_by: str | None
    created_at: datetime
    updated_at: datetime


class AnnouncementPublicOut(BaseModel):
    id: str
    text: str
    level: AnnouncementLevel
    link_url: str | None
    link_label: str | None


PolicyVersionStatus = Literal["draft", "published", "superseded"]


class PolicyVersionOut(BaseModel):
    """Admin shape: full per-locale Markdown source and provenance for one version."""

    id: str
    policy_key: str
    version_number: int
    status: PolicyVersionStatus
    content_nl: str | None
    content_fr: str | None
    content_en: str | None
    change_summary: str | None
    created_at: datetime
    created_by: str
    updated_at: datetime
    published_at: datetime | None
    published_by: str | None

    model_config = ConfigDict(from_attributes=True)


class PolicyOut(BaseModel):
    """Admin shape: the policy plus its full version history, newest first."""

    key: str
    title_nl: str | None
    title_fr: str | None
    title_en: str | None
    versions: list[PolicyVersionOut]


class PolicyDraftCreate(RequestModel):
    """Seed a new draft.

    Omit ``source_version_number`` to copy the current published version (the
    normal "edit from current" flow). Pass an older, historical version's
    number instead to seed a rollback draft with that version's content —
    publishing it is what actually performs the rollback.
    """

    source_version_number: int | None = None


class PolicyDraftUpdate(RequestModel):
    """Edit the open draft. The draft may be incomplete; publishing requires Dutch text."""

    content_nl: MarkdownSource | None = None
    content_fr: MarkdownSource | None = None
    content_en: MarkdownSource | None = None
    change_summary: Text2000 | None = None


class PolicyRenderRequest(RequestModel):
    """Render arbitrary, not-yet-saved Markdown for live preview.

    Uses the exact same renderer/sanitizer as the public endpoint, so what an
    admin previews here is guaranteed to match what publishing would produce.
    """

    markdown: MarkdownSource = ""


class PolicyRenderOut(BaseModel):
    html: str


class PolicyPublicOut(BaseModel):
    key: str
    title: str
    locale: FaqLocale
    """The language `html` is written in: the requested one, or Dutch when that locale
    has no content."""
    html: str
    version_number: int
    published_at: datetime


class EditionAttendanceStats(BaseModel):
    edition_id: str
    year: int
    month: str
    edition_type: str
    start_date: dt_date | None
    events_count: int
    total_registrations: int
    total_guests: int
    total_checked_in: int
    total_paid: Decimal
    total_due: Decimal
    total_received: Decimal = Decimal(0)
    """Sum of `payment`-kind ledger entries (#1019) — gross money taken in,
    before refunds; compare with `total_refunded`."""
    total_refunded: Decimal = Decimal(0)
    """Sum of `refund`-kind ledger entries, as a positive amount."""
    total_outstanding: Decimal = Decimal(0)
    """Sum, per booking, of max(amount_due - net paid, 0) — money still owed."""
    total_refund_liability: Decimal = Decimal(0)
    """Sum, per booking, of max(net paid - amount_due, 0) — overpaid amounts
    a refund may be owed against."""


# ---------------------------------------------------------------------------
# Web Push subscriptions (#941)
# ---------------------------------------------------------------------------


class PushSubscriptionKeys(RequestModel):
    """The ``keys`` object from a browser ``PushSubscription.toJSON()``."""

    p256dh: NonEmptyText200
    auth: NonEmptyText50


class PushSubscribeRequest(RequestModel):
    endpoint: NonEmptyText600
    keys: PushSubscriptionKeys
    locale: Literal["nl", "fr", "en"]
    categories: list[str] = Field(default_factory=list, max_length=10)
    event_ids: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("endpoint")
    @classmethod
    def endpoint_must_be_https(cls, v: str) -> str:
        # Push endpoints are always https:// in practice; rejecting anything
        # else up front is cheap defense against a malformed or spoofed body
        # before it ever reaches app.services.push_service.
        if not v.startswith("https://"):
            raise ValueError("endpoint must be an https:// URL")
        return v


class PushSubscriptionOut(BaseModel):
    id: str
    categories: list[str]
    event_ids: list[str]


class PushUnsubscribeRequest(RequestModel):
    endpoint: NonEmptyText600


class VapidPublicKeyOut(BaseModel):
    public_key: str
    enabled: bool
    """False when VAPID isn't configured server-side — the frontend shows no
    opt-in UI in that case rather than a subscribe attempt doomed to fail."""


class PushTestRequest(RequestModel):
    subscription_id: ResourceId


# ---------------------------------------------------------------------------
# Central composer (#942)
# ---------------------------------------------------------------------------

ComposedMessageChannel = Literal["announcement", "push"]
ComposedMessageState = Literal["draft", "scheduled", "sent"]


class _ComposedMessageFields[
    LevelT: AnnouncementLevel | None,
    ChannelsT: list[ComposedMessageChannel] | None,
](RequestModel):
    """Title and body per language (#1222): Dutch must have both, the others are
    optional, and a language is used only when both its title and body have text
    (otherwise the Dutch text is delivered)."""

    title_nl: Text500 | None = None
    title_fr: Text500 | None = None
    title_en: Text500 | None = None
    body_nl: Text500 | None = None
    body_fr: Text500 | None = None
    body_en: Text500 | None = None
    level: LevelT
    channels: ChannelsT
    link_url: Text1000 | None = None

    _safe_link_url = field_validator("link_url")(_validate_safe_announcement_url)

    @field_validator("title_nl", "title_fr", "title_en", "body_nl", "body_fr", "body_en", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("channels")
    @classmethod
    def no_duplicate_channels(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("channels must not contain duplicates")
        return value


class ComposedMessageFields(_ComposedMessageFields[AnnouncementLevel | None, list[ComposedMessageChannel] | None]):
    """Title and body per language (#1222): Dutch must have both, the others are
    optional, and a language is used only when both its title and body have text
    (otherwise the Dutch text is delivered)."""

    level: AnnouncementLevel | None = None
    channels: list[ComposedMessageChannel] | None = Field(default=None, min_length=1)


class ComposedMessageWrite(_ComposedMessageFields[AnnouncementLevel, list[ComposedMessageChannel]]):
    """The complete, validated state of a composed message (create body, and what an update merges into)."""

    level: AnnouncementLevel = "info"
    channels: list[ComposedMessageChannel] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_composed_message(self):
        if not self.title_nl or not self.body_nl:
            raise ValueError("a composed message needs a Dutch title and a Dutch body")
        if "push" in self.channels:
            for locale in LOCALES:
                text = pick_locale_text(self, locale)
                if text is not None:
                    build_composer_payload(*text)
        return self


class ComposedMessageCreate(ComposedMessageWrite):
    pass


class ComposedMessageUpdate(ComposedMessageFields):
    """Only valid while the message is still ``draft`` — see
    ``app.services.composer_service.update_draft``."""


class ComposedMessageOut(BaseModel):
    id: str
    title_nl: str | None
    title_fr: str | None
    title_en: str | None
    body_nl: str | None
    body_fr: str | None
    body_en: str | None
    level: AnnouncementLevel
    channels: list[str]
    link_url: str | None
    state: ComposedMessageState
    scheduled_at: datetime | None
    announcement_id: str | None
    push_audience_snapshot: list[str] | None
    sent_at: datetime | None
    sent_by: str | None
    created_at: datetime
    updated_at: datetime
    estimated_push_audience: int
    """Current opted-in push subscriber count — an estimate shown before
    confirmation, not the immutable snapshot (``push_audience_snapshot``,
    only set once ``state == "sent"``). Resolved fresh on every read."""
    push_delivered_count: int
    push_failed_count: int
    push_pending_count: int
    """Aggregate outcome counts for this message's push delivery jobs — all
    zero until ``state == "sent"``. Never exposes a subscription's endpoint
    or keys, only counts (acceptance criterion: "per-channel results are
    visible without exposing secrets")."""

    model_config = ConfigDict(from_attributes=True)


class ComposedMessageScheduleRequest(RequestModel):
    scheduled_at: datetime | None = None
    """``None`` sends as soon as the worker next polls (#947) — "publish now"
    is "schedule for right now", not a separate code path."""

    @field_validator("scheduled_at")
    @classmethod
    def timezone_required(cls, value: datetime | None) -> datetime | None:
        if value and value.utcoffset() is None:
            raise ValueError("scheduled_at must include a timezone")
        return value


class ManagedOrganizationOut(OrganizationDescription):
    id: int
    name: str
    type: str
    website: str
    active: bool


class OrganizationChangeSubmit(OrganizationDescription):
    submission_id: UUID
    website: Text500 | None = None

    @field_validator("website")
    @classmethod
    def validate_website(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Use an empty string to clear the website.")
        value = value.strip()
        if value and not re.match(r"^https?://.+", value):
            raise ValueError("Website must start with http:// or https://.")
        return value


class OrganizationChangeDecision(RequestModel):
    decision: Literal["accepted", "rejected"]
    reason: Text2000 | None = None


class OrganizationChangeOut(BaseModel):
    id: str
    organization_id: int
    organization_name: str
    status: Literal["pending", "accepted", "rejected", "superseded", "replaced"]
    proposed: dict[str, str | None]
    current: dict[str, str | None]
    superseded_fields: list[str]
    reason: str | None
    created_at: datetime


class StampCardTypeWrite(RequestModel):
    name_nl: NonEmptyText200
    name_fr: Text200 | None = None
    name_en: Text200 | None = None
    box_count: PositiveQuantity
    reward_label_nl: NonEmptyText200
    reward_label_fr: Text200 | None = None
    reward_label_en: Text200 | None = None
    active: bool = True

    @field_validator("name_nl", "reward_label_nl")
    @classmethod
    def require_dutch_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Dutch text is required")
        return value


class StampRewardUpdate(RequestModel):
    handed_out: bool


class StampCardTypeOut(StampCardTypeWrite):
    id: str


class StampOut(BaseModel):
    id: str
    card_id: str
    registration_id: str
    created_at: datetime


class StampRewardOut(BaseModel):
    id: str
    card_id: str
    reward_label_nl: str
    reward_label_fr: str | None
    reward_label_en: str | None
    earned_at: datetime
    handed_out_at: datetime | None
    handed_out_by: str | None


class StampCardOut(BaseModel):
    id: str
    person_id: str
    type_id: str
    box_count: int
    reward_label_nl: str
    reward_label_fr: str | None
    reward_label_en: str | None
    opened_at: datetime
    completed_at: datetime | None
    stamps: list[StampOut]
    reward: StampRewardOut | None
