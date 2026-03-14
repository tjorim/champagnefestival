"""Pydantic request / response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# Shared value types
# ---------------------------------------------------------------------------

OrderItemCategory = Literal["champagne", "food", "other"]
ReservationStatus = Literal["pending", "confirmed", "cancelled"]
PaymentStatus = Literal["unpaid", "partial", "paid"]


# ---------------------------------------------------------------------------
# Order items
# ---------------------------------------------------------------------------


class OrderItemBase(BaseModel):
    product_id: str
    name: str
    quantity: int = Field(ge=1)
    price: float = Field(ge=0)
    category: OrderItemCategory
    delivered: bool = False


class OrderItemOut(OrderItemBase):
    pass


# ---------------------------------------------------------------------------
# Reservations
# ---------------------------------------------------------------------------


class ReservationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str = Field(min_length=1, max_length=50)
    event_id: str = Field(min_length=1, max_length=100)
    event_title: str = Field(min_length=1, max_length=200)
    guest_count: int = Field(ge=1, le=20)
    pre_orders: list[OrderItemBase] = Field(default_factory=list)
    notes: str = Field(default="", max_length=2000)
    # Anti-spam fields (validated server-side, not stored)
    honeypot: str = Field(default="", exclude=True)
    form_start_time: str = Field(default="", exclude=True)

    @field_validator("name", "phone", "event_id", "event_title", "notes", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class ReservationUpdate(BaseModel):
    status: ReservationStatus | None = None
    payment_status: PaymentStatus | None = None
    table_id: str | None = None
    pre_orders: list[OrderItemBase] | None = None
    notes: str | None = None
    checked_in: bool | None = None
    strap_issued: bool | None = None


class ReservationOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    event_id: str
    event_title: str
    guest_count: int
    pre_orders: list[OrderItemOut]
    notes: str
    table_id: str | None
    status: ReservationStatus
    payment_status: PaymentStatus
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReservationOutWithToken(ReservationOut):
    """Full reservation including the sensitive check-in token.
    Only returned by the admin detail endpoint."""

    check_in_token: str


class ReservationListOut(BaseModel):
    """Reservation item returned in the list endpoint.
    check_in_token is intentionally excluded here."""

    id: str
    name: str
    email: str
    event_id: str
    event_title: str
    guest_count: int
    pre_orders: list[OrderItemOut]
    table_id: str | None
    status: ReservationStatus
    payment_status: PaymentStatus
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReservationGuestOut(BaseModel):
    """Reservation data returned to visitors via the self-lookup endpoint.

    Only safe-to-expose fields — no phone, no internal notes, no checkInToken.
    Allows a guest to check their own booking status and pre-order summary.
    """

    id: str
    event_id: str
    event_title: str
    guest_count: int
    pre_orders: list[OrderItemOut]
    status: ReservationStatus
    payment_status: PaymentStatus
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Check-in
# ---------------------------------------------------------------------------


class CheckInRequest(BaseModel):
    token: str
    issue_strap: bool = True


class CheckInOut(BaseModel):
    reservation: ReservationOut
    already_checked_in: bool


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


class TableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    capacity: int = Field(ge=1, le=50)
    x: float = Field(ge=0, le=100, default=50.0)
    y: float = Field(ge=0, le=100, default=50.0)


class TableUpdate(BaseModel):
    name: str | None = None
    capacity: int | None = Field(default=None, ge=1, le=50)
    x: float | None = Field(default=None, ge=0, le=100)
    y: float | None = Field(default=None, ge=0, le=100)
    reservation_ids: list[str] | None = None


class TableOut(BaseModel):
    id: str
    name: str
    capacity: int
    x: float
    y: float
    reservation_ids: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
