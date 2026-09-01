"""Pydantic request / response schemas."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Shared value types
# ---------------------------------------------------------------------------

OrderItemCategory = Literal["champagne", "food", "other"]
EditionType = Literal["festival", "bourse", "capsule_exchange"]
RegistrationStatus = Literal["pending", "confirmed", "cancelled"]
PaymentStatus = Literal["unpaid", "partial", "paid"]
FaqLocale = Literal["nl", "en", "fr"]


class RequestModel(BaseModel):
    """Base for external request bodies; reject misspelled or stale fields."""

    model_config = {"extra": "forbid"}


# ---------------------------------------------------------------------------
# Order items
# ---------------------------------------------------------------------------


class OrderItemBase(BaseModel):
    product_id: str
    name: str
    quantity: int = Field(ge=1)
    price: float = Field(ge=0)
    category: OrderItemCategory
    delivered_quantity: int | None = Field(default=None, ge=0)
    delivered: bool = False
    included_quantity: int = Field(default=0, ge=0)
    """How many of `quantity` came free via a product bundle (see
    Product.included_product_id) — only `quantity - included_quantity` is
    billed at `price` per unit."""

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

    product_id: str = Field(min_length=1)
    quantity: int = Field(ge=1, le=100)


class RegistrationDeliveryUpdate(RequestModel):
    """The only order-line fields an entrance volunteer may change."""

    product_id: str = Field(min_length=1)
    delivered_quantity: int = Field(ge=0)


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

    model_config = {"from_attributes": True}


class PersonOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    address: str
    roles: list[str]
    national_register_number: str | None
    eid_document_number: str | None
    visits_per_month: int | None
    club_name: str
    notes: str
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PersonListEnvelope(BaseModel):
    """Paginated response for the admin people/members lists.

    ``total`` counts every row matching the current filters, not just this
    page, so a client can tell ``items`` was truncated instead of silently
    rendering a partial result as if it were complete — see
    ``RegistrationListEnvelope``, which this mirrors.
    """

    items: list[PersonOut]
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

    model_config = {"from_attributes": True}


class EventCreate(RequestModel):
    edition_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    date: dt_date
    start_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    category: str = Field(min_length=1, max_length=50)
    registration_required: bool = False
    registrations_open_from: datetime | None = None
    registrations_close_at: datetime | None = None
    max_capacity: int | None = Field(default=None, ge=1)
    active: bool = True


class EventUpdate(RequestModel):
    edition_id: str | None = Field(default=None, min_length=1, max_length=100)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    date: dt_date | None = None
    start_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    category: str | None = Field(default=None, min_length=1, max_length=50)
    registration_required: bool | None = None
    registrations_open_from: datetime | None = None
    registrations_close_at: datetime | None = None
    max_capacity: int | None = Field(default=None, ge=1)
    active: bool | None = None


class EventOut(BaseModel):
    id: str
    edition_id: str
    title: str
    description: str
    date: dt_date
    start_time: str
    end_time: str | None
    category: str
    registration_required: bool
    registrations_open_from: datetime | None
    registrations_close_at: datetime | None
    max_capacity: int | None
    active: bool
    edition: EditionSummaryOut | None = None
    products: list[ProductOut] = Field(default_factory=list)
    """Active products only — see ProductOut. Empty means nothing to order."""
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductCreate(RequestModel):
    event_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    price: Decimal = Field(ge=0, decimal_places=2, max_digits=10)
    category: OrderItemCategory
    active: bool = True
    required: bool = False
    included_product_id: str | None = Field(default=None, min_length=1, max_length=64)
    included_per_guests: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_inclusion_pair(self) -> Self:
        if (self.included_product_id is None) != (self.included_per_guests is None):
            raise ValueError("included_product_id and included_per_guests must be set together.")
        return self


class ProductUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2, max_digits=10)
    category: OrderItemCategory | None = None
    active: bool | None = None
    required: bool | None = None
    # Nullable and independently settable, so the router (not this schema) decides
    # what "both or neither" means against the product's *resulting* state —
    # a PATCH may touch only one field while leaving the other as already stored.
    included_product_id: str | None = Field(default=None, min_length=1, max_length=64)
    included_per_guests: int | None = Field(default=None, ge=1)


class ProductOut(BaseModel):
    id: str
    event_id: str
    name: str
    price: Decimal
    category: OrderItemCategory
    active: bool
    required: bool
    included_product_id: str | None
    included_per_guests: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EventCheckInStats(BaseModel):
    """Guest counts for an event's live entrance display. `total`/`checked_in`
    are guest headcounts (sum of `guest_count`), not booking counts."""

    event_id: str
    total: int
    checked_in: int


# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------


class RegistrationCreate(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str = Field(min_length=1, max_length=50)
    event_id: str = Field(min_length=1, max_length=64)
    guest_count: int = Field(ge=1, le=20)
    order_items: list[OrderItemRequest] = Field(default_factory=list, max_length=50)
    notes: str = Field(default="", max_length=2000)
    accessibility_note: str = Field(default="", max_length=2000)
    honeypot: str = Field(default="", exclude=True)
    form_start_time: str = Field(default="", exclude=True)

    @field_validator("name", "phone", "event_id", "notes", "accessibility_note", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class RegistrationUpdate(RequestModel):
    guest_count: int | None = Field(default=None, ge=1, le=20)
    status: RegistrationStatus | None = None
    payment_status: PaymentStatus | None = None
    amount_due: Decimal | None = Field(default=None, ge=0, decimal_places=2, max_digits=10)
    table_id: str | None = None
    confirm_over_capacity: bool = False
    order_items: list[OrderItemRequest] | None = Field(default=None, max_length=50)
    notes: str | None = None
    accessibility_note: str | None = None
    person_id: str | None = Field(default=None, min_length=1)
    checked_in: bool | None = None
    strap_issued: bool | None = None


class RegistrationOut(BaseModel):
    id: str
    person_id: str
    person: PersonSummaryOut
    event_id: str
    event: EventOut
    guest_count: int
    order_items: list[OrderItemOut]
    notes: str
    accessibility_note: str
    table_id: str | None
    status: RegistrationStatus
    payment_status: PaymentStatus
    amount_due: Decimal | None
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RegistrationOutWithToken(RegistrationOut):
    """Full registration including the sensitive check-in token.
    Only returned by the admin detail endpoint."""

    check_in_token: str


class RegistrationListOut(BaseModel):
    """Registration item returned in the list endpoint.
    check_in_token is intentionally excluded here."""

    id: str
    person_id: str
    person: PersonSummaryOut
    event_id: str
    event: EventOut
    guest_count: int
    order_items: list[OrderItemOut]
    accessibility_note: str
    table_id: str | None
    status: RegistrationStatus
    payment_status: PaymentStatus
    amount_due: Decimal | None
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime

    model_config = {"from_attributes": True}


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


class RegistrationAdminCreate(RequestModel):
    """Admin-only registration creation — skips spam checks, accepts person_id directly."""

    person_id: str = Field(min_length=1, max_length=64)
    event_id: str = Field(min_length=1, max_length=64)
    guest_count: int = Field(ge=1, le=20)
    order_items: list[OrderItemRequest] = Field(default_factory=list, max_length=50)
    notes: str = Field(default="", max_length=2000)
    accessibility_note: str = Field(default="", max_length=2000)
    status: RegistrationStatus = "confirmed"

    @field_validator("event_id", "notes", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class VolunteerHelpPeriodIn(RequestModel):
    first_help_day: dt_date
    last_help_day: dt_date | None = None

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.last_help_day is not None and self.first_help_day > self.last_help_day:
            raise ValueError("first_help_day must be before or equal to last_help_day.")
        return self


class VolunteerCreate(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=300)
    national_register_number: str = Field(min_length=1, max_length=20)
    eid_document_number: str = Field(min_length=1, max_length=50)
    active: bool = True
    help_periods: list[VolunteerHelpPeriodIn] = Field(min_length=1)

    @field_validator("name", "national_register_number", "eid_document_number", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class VolunteerUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    national_register_number: str | None = Field(default=None, min_length=1, max_length=20)
    eid_document_number: str | None = Field(default=None, min_length=1, max_length=50)
    active: bool | None = None
    help_periods: list[VolunteerHelpPeriodIn] | None = Field(default=None, min_length=1)

    @field_validator("name", "national_register_number", "eid_document_number", mode="before")
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

    model_config = {"from_attributes": True}


class VolunteerOut(BaseModel):
    id: str
    name: str
    address: str
    national_register_number: str | None
    eid_document_number: str | None
    active: bool
    help_periods: list[VolunteerPeriodOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VolunteerListEnvelope(BaseModel):
    """Paginated response for the admin volunteers list. See ``PersonListEnvelope``."""

    items: list[VolunteerOut]
    total: int
    limit: int
    page: int


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

    model_config = {"from_attributes": True}


class CheckInLookupRequest(RequestModel):
    token: str


class CheckInRequest(RequestModel):
    token: str
    issue_strap: bool = True


class CheckInOut(BaseModel):
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
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str = Field(default="", max_length=50)
    address: str = Field(default="", max_length=300)
    roles: list[str] = Field(default_factory=list)
    national_register_number: str | None = Field(default=None, max_length=20)
    eid_document_number: str | None = Field(default=None, max_length=50)
    visits_per_month: int | None = Field(default=None, ge=1, le=31)
    club_name: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=2000)
    active: bool = True


class PersonUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=300)
    roles: list[str] | None = None
    national_register_number: str | None = Field(default=None, max_length=20)
    eid_document_number: str | None = Field(default=None, max_length=50)
    visits_per_month: int | None = Field(default=None, ge=1, le=31)
    club_name: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    active: bool | None = None


# ---------------------------------------------------------------------------
# Exhibitors
# ---------------------------------------------------------------------------


class ExhibitorCreate(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    image: str = Field(default="", max_length=500)
    website: str = Field(default="", max_length=500)
    active: bool = True
    type: Literal["producer", "sponsor", "vendor"] = "vendor"
    contact_person_id: str | None = None


class ExhibitorUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    image: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=500)
    active: bool | None = None
    type: Literal["producer", "sponsor", "vendor"] | None = None
    contact_person_id: str | None = None


class ExhibitorOut(BaseModel):
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

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Layouts
# ---------------------------------------------------------------------------


class LayoutCreate(RequestModel):
    edition_id: str | None = Field(default=None, max_length=100)
    room_id: str = Field(max_length=64)
    day_id: int | None = Field(default=None, ge=1)
    date: dt_date | None = None
    label: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def validate_day_reference(self) -> Self:
        if self.day_id is None and self.date is None:
            raise ValueError("Either day_id or date is required.")
        return self


class LayoutCopyCreate(LayoutCreate):
    copy_tables: bool = True
    copy_areas: bool = True


class LayoutOut(BaseModel):
    id: str
    edition_id: str | None
    room_id: str
    day_id: int
    date: dt_date | None
    label: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LayoutBulkCreate(RequestModel):
    """Create several layouts in one atomic transaction (#837).

    All items are validated and, within the batch, checked against each other
    for the same room+day+edition duplication ``create_layout`` already
    rejects — a failure partway through leaves no layout created. Pass
    ``idempotency_key`` to safely retry after a timeout or partial failure
    without risking duplicates.
    """

    items: list[LayoutCreate] = Field(min_length=1, max_length=200)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)


class LayoutBulkOut(BaseModel):
    items: list[LayoutOut]


# ---------------------------------------------------------------------------
# Table types
# ---------------------------------------------------------------------------


class TableTypeCreate(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    venue_id: str
    shape: Literal["rectangle", "round"] = "rectangle"
    # No defensible default exists for physical dimensions (unlike shape/height_type,
    # which have a legitimate industry-standard default) — required so a caller can't
    # silently persist a 0.7 x 1.8m table type without realising it (see #835).
    width_m: float = Field(ge=0.1, le=20.0)
    length_m: float = Field(ge=0.1, le=20.0)
    height_type: Literal["low", "high"] = "low"
    capacity: int = Field(ge=1, le=50)
    active: bool = True

    @model_validator(mode="after")
    def normalise_dimensions(self) -> Self:
        from app.utils import normalise_table_type_dimensions

        self.width_m, self.length_m = normalise_table_type_dimensions(self.shape, self.width_m, self.length_m)
        return self


class TableTypeUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    venue_id: str | None = None
    shape: Literal["rectangle", "round"] | None = None
    width_m: float | None = Field(default=None, ge=0.1, le=20.0)
    length_m: float | None = Field(default=None, ge=0.1, le=20.0)
    height_type: Literal["low", "high"] | None = None
    capacity: int | None = Field(default=None, ge=1, le=50)
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

    model_config = {"from_attributes": True}


class TableTypeBulkCreate(RequestModel):
    """Create several table types in one atomic transaction (#837).

    A failure partway through (e.g. an unknown ``venue_id`` on any item)
    leaves no table type created. Pass ``idempotency_key`` to safely retry
    after a timeout or partial failure without risking duplicates.
    """

    items: list[TableTypeCreate] = Field(min_length=1, max_length=200)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)


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
    name: str = Field(min_length=1, max_length=200)
    x: float = Field(ge=0, le=100, default=50.0, description=X_POSITION_DESCRIPTION)
    y: float = Field(ge=0, le=100, default=50.0, description=Y_POSITION_DESCRIPTION)
    table_type_id: str
    rotation: int = Field(ge=0, le=359, default=0, description=ROTATION_DESCRIPTION)
    layout_id: str


class TableUpdate(RequestModel):
    name: str | None = None
    x: float | None = Field(default=None, ge=0, le=100, description=X_POSITION_DESCRIPTION)
    y: float | None = Field(default=None, ge=0, le=100, description=Y_POSITION_DESCRIPTION)
    table_type_id: str | None = None
    rotation: int | None = Field(default=None, ge=0, le=359, description=ROTATION_DESCRIPTION)
    layout_id: str | None = None


class TableOut(BaseModel):
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

    model_config = {"from_attributes": True}


class TableBulkCreate(RequestModel):
    """Create several tables in one atomic transaction (#837).

    A failure partway through (e.g. an unknown ``table_type_id`` or
    ``layout_id`` on any item) leaves no table created. Pass
    ``idempotency_key`` to safely retry after a timeout or partial failure
    without risking duplicates.
    """

    items: list[TableCreate] = Field(min_length=1, max_length=200)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)


class TableBulkOut(BaseModel):
    items: list[TableOut]


# ---------------------------------------------------------------------------
# Areas
# ---------------------------------------------------------------------------


class AreaCreate(RequestModel):
    layout_id: str = Field(max_length=64)
    label: str = Field(min_length=1, max_length=200)
    icon: str = Field(default="bi-shop", max_length=50)
    exhibitor_id: int | None = None
    width_m: float = Field(ge=0.1, le=50.0, default=1.5)
    length_m: float = Field(ge=0.1, le=50.0, default=1.0)
    x: float = Field(ge=0, le=100, default=50.0, description=X_POSITION_DESCRIPTION)
    y: float = Field(ge=0, le=100, default=50.0, description=Y_POSITION_DESCRIPTION)
    rotation: int = Field(ge=0, le=359, default=0, description=ROTATION_DESCRIPTION)


class AreaUpdate(RequestModel):
    label: str | None = Field(default=None, min_length=1, max_length=200)
    icon: str | None = Field(default=None, max_length=50)
    exhibitor_id: int | None = None
    width_m: float | None = Field(default=None, ge=0.1, le=50.0)
    length_m: float | None = Field(default=None, ge=0.1, le=50.0)
    x: float | None = Field(default=None, ge=0, le=100, description=X_POSITION_DESCRIPTION)
    y: float | None = Field(default=None, ge=0, le=100, description=Y_POSITION_DESCRIPTION)
    rotation: int | None = Field(default=None, ge=0, le=359, description=ROTATION_DESCRIPTION)


class AreaOut(BaseModel):
    id: str
    layout_id: str
    icon: str
    exhibitor_id: int | None
    label: str
    x: float
    y: float
    rotation: int
    width_m: float
    length_m: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LayoutWithTablesOut(LayoutOut):
    """``LayoutOut`` plus its tables/areas, returned by ``GET /api/layouts/{id}``
    when ``include_tables=true`` is passed (or the MCP ``get_layout`` tool's
    ``include_tables`` argument). ``tables``/``areas`` are ``None`` unless
    requested, so a scoped single-layout read no longer requires a separate
    global ``list_tables``/``list_areas`` scan and client-side join.
    """

    tables: list[TableOut] | None = None
    areas: list[AreaOut] | None = None


class VenuePlanRoomOut(BaseModel):
    id: str
    name: str
    width_m: float
    length_m: float
    color: str


class VenuePlanTableOut(BaseModel):
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
    exhibitor_id: int | None


class VenuePlanLayoutOut(BaseModel):
    id: str
    day_id: int
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
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=200)
    city: str = Field(default="", max_length=100)
    postal_code: str = Field(default="", max_length=20)
    country: str = Field(default="", max_length=100)
    lat: float = 0.0
    lng: float = 0.0
    active: bool = True


class VenueUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=100)
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

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------


class RoomCreate(RequestModel):
    venue_id: str
    name: str = Field(min_length=1, max_length=200)
    # Required, not defaulted — a 20x15m default would silently masquerade as a
    # measured room dimension for whatever venue was actually entered (see #835).
    width_m: float = Field(ge=1, le=500)
    length_m: float = Field(ge=1, le=500)
    color: str = Field(default="#6c757d", pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
    active: bool = True


class RoomUpdate(RequestModel):
    venue_id: str | None = None
    name: str | None = None
    width_m: float | None = Field(default=None, ge=1, le=500)
    length_m: float | None = Field(default=None, ge=1, le=500)
    color: str | None = Field(default=None, pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
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

    model_config = {"from_attributes": True}


class RoomBulkCreate(RequestModel):
    """Create several rooms in one atomic transaction (#837).

    A failure partway through (e.g. an unknown ``venue_id`` on any item)
    leaves no room created. Pass ``idempotency_key`` to safely retry after a
    timeout or partial failure without risking duplicates.
    """

    items: list[RoomCreate] = Field(min_length=1, max_length=200)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)


class RoomBulkOut(BaseModel):
    items: list[RoomOut]


# ---------------------------------------------------------------------------
# Editions
# ---------------------------------------------------------------------------


class EditionCreate(RequestModel):
    id: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=2020, le=2100)
    month: str
    venue_id: str
    edition_type: EditionType = "festival"
    exhibitors: list[int] = Field(default_factory=list)
    co_organizer_exhibitor_id: int | None = None
    active: bool = True


class EditionUpdate(RequestModel):
    year: int | None = Field(default=None, ge=2020, le=2100)
    month: str | None = None
    venue_id: str | None = None
    edition_type: EditionType | None = None
    exhibitors: list[int] | None = None
    co_organizer_exhibitor_id: int | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def reject_null_active_and_edition_type(self) -> Self:
        for field in ("edition_type", "active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} may be omitted but cannot be null.")
        return self


class EditionItemOut(BaseModel):
    """Slim exhibitor shape embedded in the public edition response.
    Only active items are included; contact person and active flag are
    intentionally excluded — they are internal admin data."""

    id: int
    name: str
    image: str
    website: str
    type: str

    model_config = {"from_attributes": True}


class EditionOut(BaseModel):
    id: str
    year: int
    month: str
    edition_type: EditionType
    dates: list[dt_date] = Field(default_factory=list)
    venue: VenueOut
    events: list[EventOut]
    producers: list[EditionItemOut]
    sponsors: list[EditionItemOut]
    vendors: list[EditionItemOut]
    co_organizer: EditionItemOut | None = None
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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

    model_config = {"from_attributes": True}


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

    model_config = {"from_attributes": True}


class IntegrationClientCreatedOut(IntegrationClientOut):
    """Returned only from create/rotate: carries the one-time raw key.

    The raw key is never stored and never retrievable again after this
    response — only its hash persists.
    """

    key: str


class AppSettingsUpdate(RequestModel):
    maintenance_mode: bool | None = None
    public_email: EmailStr | Literal[""] | None = None
    public_phone: str | None = Field(default=None, max_length=30)
    facebook_url: str | None = Field(default=None, max_length=500)

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
    maintenance_mode: bool
    public_email: str
    public_phone: str
    facebook_url: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class FaqItemCreate(RequestModel):
    question_nl: str = Field(min_length=1, max_length=500)
    answer_nl: str = Field(min_length=1, max_length=10000)
    question_en: str | None = Field(default=None, max_length=500)
    answer_en: str | None = Field(default=None, max_length=10000)
    question_fr: str | None = Field(default=None, max_length=500)
    answer_fr: str | None = Field(default=None, max_length=10000)
    active: bool = True


class FaqItemUpdate(RequestModel):
    question_nl: str | None = Field(default=None, min_length=1, max_length=500)
    answer_nl: str | None = Field(default=None, min_length=1, max_length=10000)
    # Optional locales use presence (model_fields_set), not None-ness, to tell
    # "omitted, leave unchanged" apart from "included as '', clear it" — see
    # update_faq_item in routers/faq.py. An empty string clears the
    # translation (stored as NULL), hiding that item on that locale's FAQ.
    question_en: str | None = Field(default=None, max_length=500)
    answer_en: str | None = Field(default=None, max_length=10000)
    question_fr: str | None = Field(default=None, max_length=500)
    answer_fr: str | None = Field(default=None, max_length=10000)
    active: bool | None = None


class FaqItemReorder(RequestModel):
    """The complete, ordered list of every existing FAQ item's ID.

    `sort_order` isn't settable through create/update — this is the only way
    to change display order, and it takes the whole collection at once so a
    reorder can't leave things ambiguous or race another admin's reorder (#836).
    """

    ordered_ids: list[str] = Field(min_length=1)


class FaqItemOut(BaseModel):
    """Admin shape: every locale's content, for the FAQ editor."""

    id: str
    question_nl: str
    answer_nl: str
    question_en: str | None
    answer_en: str | None
    question_fr: str | None
    answer_fr: str | None
    sort_order: int
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FaqItemPublicOut(BaseModel):
    """Public shape: one locale's question/answer, already resolved server-side."""

    id: str
    question: str
    answer: str


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
