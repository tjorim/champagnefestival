"""Check-in and the entrance volunteer's order-line updates."""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.orders import OrderItemOut
from app.schemas.registrations import RegistrationStatus
from app.schemas.stamp_cards import StampProgress
from app.schemas.types import NonEmptyText, NonNegativeQuantity


class RegistrationDeliveryUpdate(RequestModel):
    """The only order-line fields an entrance volunteer may change."""

    product_id: NonEmptyText
    delivered_quantity: NonNegativeQuantity


class CheckInGuestOut(ResponseModel):
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


class CheckInOut(ResponseModel):
    stamp_progress: StampProgress | None = None
    registration: CheckInGuestOut
    already_checked_in: bool


class VolunteerCheckInRequest(RequestModel):
    issue_strap: bool = True


class VolunteerRegistrationUpdate(RequestModel):
    order_items: list[RegistrationDeliveryUpdate] | None = Field(default=None, max_length=50)
    strap_issued: bool | None = None
