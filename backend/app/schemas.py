"""Pydantic request / response schemas."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


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
    person_key: str | None = Field(default=None, max_length=64)
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
    person_id: str | None = None
    checked_in: bool | None = None
    strap_issued: bool | None = None


class ReservationOut(BaseModel):
    id: str
    person_key: str | None
    name: str
    email: str
    phone: str
    event_id: str
    event_title: str
    guest_count: int
    pre_orders: list[OrderItemOut]
    notes: str
    person_id: str | None
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
    person_key: str | None
    name: str
    email: str
    event_id: str
    event_title: str
    guest_count: int
    pre_orders: list[OrderItemOut]
    person_id: str | None
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
    person_key: str | None
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


class VolunteerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=300)
    first_help_day: date
    last_help_day: date
    national_register_number: str = Field(min_length=1, max_length=20)
    eid_document_number: str = Field(min_length=1, max_length=50)


class VolunteerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, min_length=1, max_length=300)
    first_help_day: date | None = None
    last_help_day: date | None = None
    national_register_number: str | None = Field(default=None, min_length=1, max_length=20)
    eid_document_number: str | None = Field(default=None, min_length=1, max_length=50)


class VolunteerOut(BaseModel):
    id: str
    name: str
    address: str
    first_help_day: date
    last_help_day: date
    national_register_number: str | None
    eid_document_number: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Check-in
# ---------------------------------------------------------------------------


class CheckInGuestOut(BaseModel):
    """Minimal reservation data returned by the public check-in GET endpoint.

    Only exposes fields needed on the volunteer tablet — guest name, party size,
    event info, pre-orders, arrival notes, and check-in/strap status.
    PII fields (email, phone) and internal-only fields (payment_status, table_id,
    timestamps) are omitted.
    """

    id: str
    name: str
    event_id: str
    event_title: str
    guest_count: int
    pre_orders: list[OrderItemOut]
    notes: str
    status: ReservationStatus
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool

    model_config = {"from_attributes": True}


class CheckInRequest(BaseModel):
    token: str
    issue_strap: bool = True


class CheckInOut(BaseModel):
    reservation: CheckInGuestOut
    already_checked_in: bool


# ---------------------------------------------------------------------------
# Content
# ---------------------------------------------------------------------------

#: Keys that are allowed to be stored via the content API.
ALLOWED_CONTENT_KEYS = frozenset({"producers", "sponsors"})


class SliderItem(BaseModel):
    id: int
    name: str = Field(min_length=1, max_length=200)
    image: str = Field(min_length=1, max_length=500)


class ContentItemOut(BaseModel):
    key: str
    value: list[SliderItem]
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContentItemUpdate(BaseModel):
    value: list[SliderItem]


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


class TableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    capacity: int = Field(ge=1, le=50)
    x: float = Field(ge=0, le=100, default=50.0)
    y: float = Field(ge=0, le=100, default=50.0)
    room_id: str | None = None
    shape: Literal["rectangle", "round"] = "rectangle"
    width_m: float = Field(ge=0.1, le=20.0, default=1.8)
    length_m: float = Field(ge=0.1, le=20.0, default=0.7)
    rotation: int = Field(ge=0, le=359, default=0)

    @model_validator(mode="after")
    def ensure_length_gte_width(self) -> "TableCreate":
        if self.length_m < self.width_m:
            self.length_m, self.width_m = self.width_m, self.length_m
        return self


class TableUpdate(BaseModel):
    name: str | None = None
    capacity: int | None = Field(default=None, ge=1, le=50)
    x: float | None = Field(default=None, ge=0, le=100)
    y: float | None = Field(default=None, ge=0, le=100)
    room_id: str | None = None
    shape: Literal["rectangle", "round"] | None = None
    width_m: float | None = Field(default=None, ge=0.1, le=20.0)
    length_m: float | None = Field(default=None, ge=0.1, le=20.0)
    rotation: int | None = Field(default=None, ge=0, le=359)
    reservation_ids: list[str] | None = None


class TableOut(BaseModel):
    id: str
    name: str
    capacity: int
    x: float
    y: float
    room_id: str | None
    shape: str
    width_m: float
    length_m: float
    rotation: int
    reservation_ids: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------

ZoneType = Literal["main-hall", "exchange"]


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    zone_type: ZoneType = "main-hall"
    width_m: float = Field(ge=1, le=500, default=20.0)
    height_m: float = Field(ge=1, le=500, default=15.0)
    color: str = Field(default="#6c757d", pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


class RoomUpdate(BaseModel):
    name: str | None = None
    zone_type: ZoneType | None = None
    width_m: float | None = Field(default=None, ge=1, le=500)
    height_m: float | None = Field(default=None, ge=1, le=500)
    color: str | None = Field(default=None, pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


class RoomOut(BaseModel):
    id: str
    name: str
    zone_type: str
    width_m: float
    height_m: float
    color: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Editions
# ---------------------------------------------------------------------------


class ScheduleEventIn(BaseModel):
    id: str
    title: str
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    description: str = ""
    reservation: bool = False
    reservations_open_from: datetime | None = None
    location: str | None = None
    presenter: str | None = None
    category: str
    day_id: int = Field(ge=1, le=3)


ScheduleEventOut = ScheduleEventIn


class EditionCreate(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=2020, le=2100)
    month: str
    friday: date
    saturday: date
    sunday: date
    venue_name: str = ""
    venue_address: str = ""
    venue_city: str = ""
    venue_postal_code: str = ""
    venue_country: str = ""
    venue_lat: float = 0.0
    venue_lng: float = 0.0
    schedule: list[ScheduleEventIn] = Field(default_factory=list)
    active: bool = True


class EditionUpdate(BaseModel):
    year: int | None = Field(default=None, ge=2020, le=2100)
    month: str | None = None
    friday: date | None = None
    saturday: date | None = None
    sunday: date | None = None
    venue_name: str | None = None
    venue_address: str | None = None
    venue_city: str | None = None
    venue_postal_code: str | None = None
    venue_country: str | None = None
    venue_lat: float | None = None
    venue_lng: float | None = None
    schedule: list[ScheduleEventIn] | None = None
    active: bool | None = None


class EditionOut(BaseModel):
    id: str
    year: int
    month: str
    friday: date
    saturday: date
    sunday: date
    venue_name: str
    venue_address: str
    venue_city: str
    venue_postal_code: str
    venue_country: str
    venue_lat: float
    venue_lng: float
    schedule: list[ScheduleEventOut]
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PersonCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str = Field(default="", max_length=50)
    address: str = Field(default="", max_length=300)
    roles: list[str] = Field(default_factory=list)
    first_help_day: date | None = None
    last_help_day: date | None = None
    national_register_number: str | None = Field(default=None, max_length=20)
    eid_document_number: str | None = Field(default=None, max_length=50)
    visits_per_month: int | None = Field(default=None, ge=1, le=31)
    club_name: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=2000)
    active: bool = True


class PersonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=300)
    roles: list[str] | None = None
    first_help_day: date | None = None
    last_help_day: date | None = None
    national_register_number: str | None = Field(default=None, max_length=20)
    eid_document_number: str | None = Field(default=None, max_length=50)
    visits_per_month: int | None = Field(default=None, ge=1, le=31)
    club_name: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    active: bool | None = None


class PersonOut(BaseModel):
    id: str
    person_key: str
    name: str
    email: str
    phone: str
    address: str
    roles: list[str]
    first_help_day: date | None
    last_help_day: date | None
    national_register_number: str | None
    eid_document_number: str | None
    visits_per_month: int | None
    club_name: str
    notes: str
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
