"""Pydantic request / response schemas."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Self
from urllib.parse import urlsplit

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.composer_content import LOCALES, build_composer_payload, pick_locale_text

# ---------------------------------------------------------------------------
# Shared value types
# ---------------------------------------------------------------------------

OrderItemCategory = Literal["champagne", "food", "other"]
EditionType = Literal["festival", "bourse", "capsule_exchange"]
RegistrationStatus = Literal["pending", "confirmed", "cancelled"]
PaymentStatus = Literal["unpaid", "partial", "paid"]
FaqLocale = Literal["nl", "en", "fr"]
AnnouncementLevel = Literal["info", "warning", "urgent"]


class RequestModel(BaseModel):
    """Base for external request bodies; reject misspelled or stale fields."""

    model_config = {"extra": "forbid"}


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
    quantity: int = Field(ge=1)
    price: float = Field(ge=0)
    category: OrderItemCategory
    delivered_quantity: int | None = Field(default=None, ge=0)
    delivered: bool = False
    included_quantity: int = Field(default=0, ge=0)
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

    product_id: str = Field(min_length=1)
    quantity: int = Field(ge=1, le=1000000)


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
    preferred_language: Literal["nl", "fr", "en"] | None = None

    model_config = {"from_attributes": True}


class PersonOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    preferred_language: Literal["nl", "fr", "en"] | None = None
    address: str
    roles: list[str]
    national_register_number: str | None
    eid_document_number: str | None
    visits_per_month: int | None
    club_name: str
    notes: str
    active: bool
    marketing_opt_in: bool
    marketing_opt_in_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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
    visits_per_month: int | None
    club_name: str
    notes: str
    active: bool
    marketing_opt_in: bool
    marketing_opt_in_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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


class PersonListEnvelope(BaseModel):
    """Paginated response for the admin people/members lists.

    ``total`` counts every row matching the current filters, not just this
    page, so a client can tell ``items`` was truncated instead of silently
    rendering a partial result as if it were complete — see
    ``RegistrationListEnvelope``, which this mirrors.
    """

    items: list[PersonAdminSummaryOut]
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
    """Purchasable products only — see ProductOut. Empty means nothing to order."""
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EventPublicOut(BaseModel):
    """Visitor-facing event shape — see ProductPublicOut for why `products`
    differs from `EventOut.products`."""

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
    products: list[ProductPublicOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductInclusion(RequestModel):
    product_id: str = Field(min_length=1, max_length=64)
    quantity: int = Field(default=1, ge=1, le=1000000)
    per_quantity: int = Field(default=1, ge=1, le=1000000)
    rounding: Literal["up", "down"] = "down"


class ProductCreate(RequestModel):
    unit: Literal["item", "table", "person"] = "item"
    stock: int | None = Field(default=None, ge=0, le=2147483647)
    inclusions: list[ProductInclusion] | None = Field(default=None, max_length=50)
    event_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=300)
    price: Decimal = Field(ge=0, decimal_places=2, max_digits=10)
    category: OrderItemCategory
    purchasable: bool = True
    required: bool = False
    included_product_id: str | None = Field(default=None, min_length=1, max_length=64)
    included_per_guests: int | None = Field(default=None, ge=1)

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


class ProductUpdate(RequestModel):
    unit: Literal["item", "table", "person"] | None = None
    stock: int | None = Field(default=None, ge=0, le=2147483647)
    inclusions: list[ProductInclusion] | None = Field(default=None, max_length=50)
    update_existing_contents: bool = False
    update_existing_prices: bool = False
    confirm_shortage: bool = False
    preview_token: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=300)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2, max_digits=10)
    category: OrderItemCategory | None = None
    purchasable: bool | None = None
    required: bool | None = None
    # Nullable and independently settable, so the router (not this schema) decides
    # what "both or neither" means against the product's *resulting* state —
    # a PATCH may touch only one field while leaving the other as already stored.
    # `purchasable`/`required` are validated against the *resulting* state too
    # (see app.services.product_changes.change_product), for the same reason.
    included_product_id: str | None = Field(default=None, min_length=1, max_length=64)
    included_per_guests: int | None = Field(default=None, ge=1)


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
    description: str = ""
    price: Decimal
    category: OrderItemCategory
    purchasable: bool
    required: bool
    included_product_id: str | None
    included_per_guests: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductPublicOut(BaseModel):
    """The visitor-facing shape of a product: always `purchasable=True` —
    see app.utils.event_to_summary_dict, which excludes every hidden
    (`purchasable=False`) product from the public response entirely, and
    strips any `inclusions`/`included_product_id` edge that targets one."""

    id: str
    name: str
    description: str = ""
    price: Decimal
    category: OrderItemCategory
    unit: str = "item"
    required: bool
    purchasable: bool
    available_quantity: int | None = None
    sold_out: bool = False
    inclusions: list[ProductInclusion] | None = None
    included_product_id: str | None = None
    included_per_guests: int | None = None

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


_MAX_REQUESTED_ORDER_LINE_QUANTITY = 1000
"""Ceiling on a client-requested (not yet package-expanded) order line quantity.

Far above any real booking (guest_count is capped at 20), but well below
OrderItemRequest.quantity's own 1,000,000 field bound, which stays high because
it also re-validates already-persisted order items when reconstructed
internally (see app.services.product_inventory.purchased_requests)."""


class RegistrationNotesRequest(RequestModel):
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
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str = Field(min_length=1, max_length=50)
    preferred_language: Literal["nl", "fr", "en"] = "nl"
    event_id: str = Field(min_length=1, max_length=64)
    guest_count: int = Field(ge=1, le=20)
    order_items: list[OrderItemRequest] = Field(default_factory=list, max_length=50)
    notes: str = Field(default="", max_length=4000)
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
    table_id: str = Field(min_length=1, max_length=64)
    guest_count: int = Field(ge=0, le=20)
    exclusive: bool = False


class RegistrationUpdate(RegistrationNotesRequest):
    allocations: list[TableAllocation] | None = Field(default=None, max_length=1000)
    guest_count: int | None = Field(default=None, ge=1, le=20)
    status: RegistrationStatus | None = None
    amount_due: Decimal | None = Field(default=None, ge=0, decimal_places=2, max_digits=10)
    confirm_over_capacity: bool = False
    order_items: list[OrderItemRequest] | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=4000)
    person_id: str | None = Field(default=None, min_length=1)
    checked_in: bool | None = None
    strap_issued: bool | None = None


class RegistrationOut(BaseModel):
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

    model_config = {"from_attributes": True}


class RegistrationPublicOut(BaseModel):
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

    model_config = {"from_attributes": True}


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
    reference: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    reversed_transaction_id: str | None = Field(default=None, min_length=1, max_length=64)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)
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

    model_config = {"from_attributes": True}


class PaymentTransactionLedgerRow(PaymentTransactionOut):
    """One ledger entry with the booking context needed to render an
    edition- or person-level ledger view (#1019), so the admin UI doesn't
    need a round trip per row to resolve which booking/person it belongs to.
    """

    person_name: str
    event_title: str
    edition_label: str


class RegistrationListOut(BaseModel):
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
    amount_paid: Decimal = Decimal(0)
    refund_due: Decimal | None = Decimal(0)
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

    person_id: str = Field(min_length=1, max_length=64)
    event_id: str = Field(min_length=1, max_length=64)
    guest_count: int = Field(ge=1, le=20)
    order_items: list[OrderItemRequest] = Field(default_factory=list, max_length=50)
    notes: str = Field(default="", max_length=4000)
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
    preferred_language: Literal["nl", "fr", "en"] | None = None
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
    preferred_language: Literal["nl", "fr", "en"] | None = None
    address: str | None = Field(default=None, max_length=300)
    roles: list[str] | None = None
    national_register_number: str | None = Field(default=None, max_length=20)
    eid_document_number: str | None = Field(default=None, max_length=50)
    visits_per_month: int | None = Field(default=None, ge=1, le=31)
    club_name: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    active: bool | None = None
    marketing_opt_in: bool | None = None
    """Admin-initiated correction only (e.g. processing an opt-out request
    received through the contact form) — the registration form is the actual
    consent channel; this is not exposed there."""


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
    event_id: str = Field(min_length=1, max_length=64)
    room_id: str = Field(min_length=1, max_length=64)
    label: str = Field(default="", max_length=200)


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

    model_config = {"from_attributes": True}


class LayoutBulkCreate(RequestModel):
    """Create several layouts in one atomic transaction (#837).

    All items are validated and, within the batch, checked against each other
    for the same room+event duplication ``create_layout`` already
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
    ``exhibitor_id``: allocations are live operational data, not part of any
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
    area ``exhibitor_id`` — those remain live operational data outside any
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

    model_config = {"from_attributes": True}


class LayoutRevisionSummaryOut(BaseModel):
    """Lightweight revision listing shape, without the (potentially large) snapshot."""

    id: str
    layout_id: str
    revision_number: int
    label: str
    change_note: str | None
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class LayoutRevisionSaveRequest(RequestModel):
    label: str = Field(min_length=1, max_length=200)
    change_note: str | None = Field(default=None, max_length=2000)

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

    Restoring never touches ``Registration``/``Area.exhibitor_id`` itself —
    this only flags that the *geometry* change (delete/move) would orphan an
    existing allocation, so the caller can make a deliberate call via
    ``LayoutRestoreRequest.resolve_allocations``.
    """

    kind: Literal["table", "area"]
    id: str
    name: str
    reason: Literal["deleted", "moved"]
    registration_ids: list[str] = Field(default_factory=list)
    exhibitor_id: int | None = None


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
    exhibitor_id: int | None


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


class AnnouncementWrite(RequestModel):
    text_nl: str | None = Field(default=None, max_length=500)
    text_en: str | None = Field(default=None, max_length=500)
    text_fr: str | None = Field(default=None, max_length=500)
    level: AnnouncementLevel = "info"
    active: bool = False
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    link_url: str | None = Field(default=None, max_length=1000)
    link_label_nl: str | None = Field(default=None, max_length=120)
    link_label_en: str | None = Field(default=None, max_length=120)
    link_label_fr: str | None = Field(default=None, max_length=120)

    _safe_link_url = field_validator("link_url")(_validate_safe_announcement_url)

    @model_validator(mode="after")
    def validate_announcement(self):
        if self.active and not any((self.text_nl, self.text_en, self.text_fr)):
            raise ValueError("an active announcement needs at least one translation")
        if self.starts_at and self.starts_at.utcoffset() is None:
            raise ValueError("starts_at must include a timezone")
        if self.ends_at and self.ends_at.utcoffset() is None:
            raise ValueError("ends_at must include a timezone")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        if self.link_url and not any((self.link_label_nl, self.link_label_en, self.link_label_fr)):
            raise ValueError("a link URL requires at least one translated link label")
        return self


class AnnouncementCreate(AnnouncementWrite):
    pass


class AnnouncementUpdate(RequestModel):
    text_nl: str | None = Field(default=None, max_length=500)
    text_en: str | None = Field(default=None, max_length=500)
    text_fr: str | None = Field(default=None, max_length=500)
    level: AnnouncementLevel | None = None
    active: bool | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    link_url: str | None = Field(default=None, max_length=1000)
    link_label_nl: str | None = Field(default=None, max_length=120)
    link_label_en: str | None = Field(default=None, max_length=120)
    link_label_fr: str | None = Field(default=None, max_length=120)

    _safe_link_url = field_validator("link_url")(_validate_safe_announcement_url)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def timezone_required(cls, value: datetime | None) -> datetime | None:
        if value and value.utcoffset() is None:
            raise ValueError("announcement timestamps must include a timezone")
        return value


class AnnouncementReorder(RequestModel):
    ordered_ids: list[str] = Field(min_length=1)


class AnnouncementOut(BaseModel):
    id: str
    text_nl: str | None
    text_en: str | None
    text_fr: str | None
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
    content_en: str | None
    content_fr: str | None
    change_summary: str | None
    created_at: datetime
    created_by: str
    updated_at: datetime
    published_at: datetime | None
    published_by: str | None

    model_config = {"from_attributes": True}


class PolicyOut(BaseModel):
    """Admin shape: the policy plus its full version history, newest first."""

    key: str
    title_nl: str
    title_en: str | None
    title_fr: str | None
    required_locales: list[FaqLocale]
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
    content_nl: str | None = Field(default=None, max_length=200_000)
    content_en: str | None = Field(default=None, max_length=200_000)
    content_fr: str | None = Field(default=None, max_length=200_000)
    change_summary: str | None = Field(default=None, max_length=2000)


class PolicyRenderRequest(RequestModel):
    """Render arbitrary, not-yet-saved Markdown for live preview.

    Uses the exact same renderer/sanitizer as the public endpoint, so what an
    admin previews here is guaranteed to match what publishing would produce.
    """

    markdown: str = Field(default="", max_length=200_000)


class PolicyRenderOut(BaseModel):
    html: str


class PolicyPublicOut(BaseModel):
    key: str
    title: str
    locale: FaqLocale
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

    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=50)


class PushSubscribeRequest(RequestModel):
    endpoint: str = Field(min_length=1, max_length=600)
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
    endpoint: str = Field(min_length=1, max_length=600)


class VapidPublicKeyOut(BaseModel):
    public_key: str
    enabled: bool
    """False when VAPID isn't configured server-side — the frontend shows no
    opt-in UI in that case rather than a subscribe attempt doomed to fail."""


class PushTestRequest(RequestModel):
    subscription_id: str = Field(min_length=1, max_length=64)


# ---------------------------------------------------------------------------
# Central composer (#942)
# ---------------------------------------------------------------------------

ComposedMessageChannel = Literal["announcement", "push"]
ComposedMessageState = Literal["draft", "scheduled", "sent"]


class ComposedMessageWrite(RequestModel):
    title_nl: str | None = Field(default=None, max_length=500)
    title_en: str | None = Field(default=None, max_length=500)
    title_fr: str | None = Field(default=None, max_length=500)
    body_nl: str | None = Field(default=None, max_length=500)
    body_en: str | None = Field(default=None, max_length=500)
    body_fr: str | None = Field(default=None, max_length=500)
    level: AnnouncementLevel = "info"
    channels: list[ComposedMessageChannel] = Field(min_length=1)
    link_url: str | None = Field(default=None, max_length=1000)

    _safe_link_url = field_validator("link_url")(_validate_safe_announcement_url)

    @model_validator(mode="after")
    def validate_composed_message(self):
        if pick_locale_text(self, "nl") is None:
            raise ValueError("a composed message needs at least one complete translated title/body pair")
        if "push" in self.channels:
            for locale in LOCALES:
                text = pick_locale_text(self, locale)
                if text is not None:
                    build_composer_payload(*text)
        if len(set(self.channels)) != len(self.channels):
            raise ValueError("channels must not contain duplicates")
        return self


class ComposedMessageCreate(ComposedMessageWrite):
    pass


class ComposedMessageUpdate(RequestModel):
    """Only valid while the message is still ``draft`` — see
    ``app.services.composer_service.update_draft``."""

    title_nl: str | None = Field(default=None, max_length=500)
    title_en: str | None = Field(default=None, max_length=500)
    title_fr: str | None = Field(default=None, max_length=500)
    body_nl: str | None = Field(default=None, max_length=500)
    body_en: str | None = Field(default=None, max_length=500)
    body_fr: str | None = Field(default=None, max_length=500)
    level: AnnouncementLevel | None = None
    channels: list[ComposedMessageChannel] | None = Field(default=None, min_length=1)
    link_url: str | None = Field(default=None, max_length=1000)

    _safe_link_url = field_validator("link_url")(_validate_safe_announcement_url)

    @field_validator("channels")
    @classmethod
    def no_duplicate_channels(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("channels must not contain duplicates")
        return value


class ComposedMessageOut(BaseModel):
    id: str
    title_nl: str | None
    title_en: str | None
    title_fr: str | None
    body_nl: str | None
    body_en: str | None
    body_fr: str | None
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

    model_config = {"from_attributes": True}


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
