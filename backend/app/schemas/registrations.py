"""Registrations (reservations) and their admin, public and portal shapes."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import ConfigDict, EmailStr, Field, PrivateAttr, field_validator, model_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.events import EventCheckInStats, EventOut, EventPublicOut
from app.schemas.orders import OrderAnswerIn, OrderAnswerOut, OrderItemOut, OrderItemRequest
from app.schemas.people import PersonSummaryOut
from app.schemas.stamp_cards import StampProgress
from app.schemas.types import (
    GuestCount,
    NonEmptyText,
    NonEmptyText50,
    NonEmptyText200,
    ProductPrice,
    ResourceId,
    Text4000,
)

RegistrationStatus = Literal["pending", "confirmed", "cancelled"]


PaymentStatus = Literal["unpaid", "partial", "paid"]


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
    new_editions_opt_in: bool = Field(
        default=False,
        description=(
            "Explicit, unticked-by-default wish to be mailed when registrations open for a new edition — "
            "a separate legal basis from the operational registration purpose. It only becomes consent "
            "(category `new_editions`) once the email address is verified: directly for a signed-in person "
            "using their own verified address, otherwise through an emailed confirmation link. Never implied."
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


class RegistrationOut(ResponseModel):
    # Replay storage is already JSON-serialized. MCP preserves that historical
    # payload at its boundary; this metadata is never part of the API schema.
    _from_idempotency_replay: bool = PrivateAttr(default=False)

    poll_question_id: str | None = None
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


class RegistrationPublicOut(ResponseModel):
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


class RegistrationListOut(ResponseModel):
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
    table_names: list[str]
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


class RegistrationEventStats(EventCheckInStats):
    edition_id: str | None


class RegistrationDashboardStats(ResponseModel):
    """Booking facets include cancelled bookings unless filtered by status."""

    all: int
    pending: int
    confirmed: int
    festival: int
    standalone: int
    active: int
    today: int
    events: list[RegistrationEventStats]


class RegistrationListEnvelope(ResponseModel):
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


class RegistrationGuestOut(ResponseModel):
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


class MyRegistrationOut(ResponseModel):
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


class RegistrationAdminCreate(RegistrationNotesRequest):
    """Admin-only registration creation — skips spam checks, accepts person_id directly."""

    person_id: ResourceId
    event_id: ResourceId
    guest_count: GuestCount
    order_items: list[OrderItemRequest] = Field(default_factory=list, max_length=50)
    notes: Text4000 = ""
    status: RegistrationStatus = "confirmed"
    idempotency_key: NonEmptyText200 | None = None
    """Lets a client retry after a timeout without booking twice: a repeat with the same key and body returns the first booking."""

    @field_validator("event_id", "notes", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v
