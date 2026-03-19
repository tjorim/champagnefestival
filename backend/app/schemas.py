"""Pydantic request / response schemas."""

from datetime import date, datetime
from typing import Literal, Self

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
# People (output — defined early so reservation schemas can reference it)
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
    accessibility_note: str | None = None
    person_id: str | None = Field(default=None, min_length=1)
    checked_in: bool | None = None
    strap_issued: bool | None = None


class ReservationOut(BaseModel):
    id: str
    person_id: str
    person: PersonSummaryOut
    event_id: str
    event_title: str
    guest_count: int
    pre_orders: list[OrderItemOut]
    notes: str
    accessibility_note: str
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
    person_id: str
    person: PersonSummaryOut
    event_id: str
    event_title: str
    guest_count: int
    pre_orders: list[OrderItemOut]
    accessibility_note: str
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

    Only safe-to-expose fields — no internal notes, no checkInToken.
    Allows a guest to check their own booking status and pre-order summary.
    """

    id: str
    name: str
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


class ReservationAdminCreate(BaseModel):
    """Admin-only reservation creation — skips spam checks, accepts person_id directly."""

    person_id: str = Field(min_length=1, max_length=64)
    event_id: str = Field(min_length=1, max_length=100)
    event_title: str = Field(min_length=1, max_length=200)
    guest_count: int = Field(ge=1, le=20)
    pre_orders: list[OrderItemBase] = Field(default_factory=list)
    notes: str = Field(default="", max_length=2000)
    accessibility_note: str = Field(default="", max_length=2000)
    status: ReservationStatus = "confirmed"

    @field_validator("event_id", "event_title", "notes", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


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
# People
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Exhibitors
# ---------------------------------------------------------------------------


class ExhibitorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    image: str = Field(default="", max_length=500)
    website: str = Field(default="", max_length=500)
    active: bool = True
    type: Literal["producer", "sponsor", "vendor"] = "vendor"
    contact_person_id: str | None = None


class ExhibitorUpdate(BaseModel):
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
    contact_person: PersonOut | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Layouts
# ---------------------------------------------------------------------------


class LayoutCreate(BaseModel):
    edition_id: str | None = Field(default=None, max_length=100)
    room_id: str = Field(max_length=64)
    day_id: int = Field(ge=1, le=3)
    label: str = Field(default="", max_length=200)


class LayoutOut(BaseModel):
    id: str
    edition_id: str | None
    room_id: str
    day_id: int
    label: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Table types
# ---------------------------------------------------------------------------


class TableTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    shape: Literal["rectangle", "round"] = "rectangle"
    width_m: float = Field(ge=0.1, le=20.0, default=0.7)
    length_m: float = Field(ge=0.1, le=20.0, default=1.8)
    height_type: Literal["low", "high"] = "low"
    max_capacity: int = Field(ge=1, le=50)
    active: bool = True

    @model_validator(mode="after")
    def normalise_dimensions(self) -> Self:
        if self.shape == "round":
            self.length_m = self.width_m
        elif self.length_m < self.width_m:
            self.length_m, self.width_m = self.width_m, self.length_m
        return self


class TableTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    shape: Literal["rectangle", "round"] | None = None
    width_m: float | None = Field(default=None, ge=0.1, le=20.0)
    length_m: float | None = Field(default=None, ge=0.1, le=20.0)
    height_type: Literal["low", "high"] | None = None
    max_capacity: int | None = Field(default=None, ge=1, le=50)
    active: bool | None = None


class TableTypeOut(BaseModel):
    id: str
    name: str
    shape: str
    width_m: float
    length_m: float
    height_type: str
    max_capacity: int
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


class TableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    capacity: int = Field(ge=1, le=50)
    x: float = Field(ge=0, le=100, default=50.0)
    y: float = Field(ge=0, le=100, default=50.0)
    table_type_id: str
    rotation: int = Field(ge=0, le=359, default=0)
    layout_id: str
class TableUpdate(BaseModel):
    name: str | None = None
    capacity: int | None = Field(default=None, ge=1, le=50)
    x: float | None = Field(default=None, ge=0, le=100)
    y: float | None = Field(default=None, ge=0, le=100)
    table_type_id: str | None = None
    rotation: int | None = Field(default=None, ge=0, le=359)
    layout_id: str | None = None
    reservation_ids: list[str] | None = None


class TableOut(BaseModel):
    id: str
    name: str
    capacity: int
    x: float
    y: float
    table_type_id: str
    rotation: int
    layout_id: str
    reservation_ids: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Areas
# ---------------------------------------------------------------------------

class AreaCreate(BaseModel):
    layout_id: str = Field(max_length=64)
    label: str = Field(min_length=1, max_length=200)
    icon: str = Field(default="bi-shop", max_length=50)
    exhibitor_id: int | None = None
    width_m: float = Field(ge=0.1, le=50.0, default=1.5)
    length_m: float = Field(ge=0.1, le=50.0, default=1.0)
    x: float = Field(ge=0, le=100, default=50.0)
    y: float = Field(ge=0, le=100, default=50.0)
    rotation: int = Field(ge=0, le=359, default=0)


class AreaUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=200)
    icon: str | None = Field(default=None, max_length=50)
    exhibitor_id: int | None = None
    width_m: float | None = Field(default=None, ge=0.1, le=50.0)
    length_m: float | None = Field(default=None, ge=0.1, le=50.0)
    x: float | None = Field(default=None, ge=0, le=100)
    y: float | None = Field(default=None, ge=0, le=100)
    rotation: int | None = Field(default=None, ge=0, le=359)


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


# ---------------------------------------------------------------------------
# Venues
# ---------------------------------------------------------------------------


class VenueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=200)
    city: str = Field(default="", max_length=100)
    postal_code: str = Field(default="", max_length=20)
    country: str = Field(default="", max_length=100)
    lat: float = 0.0
    lng: float = 0.0
    active: bool = True


class VenueUpdate(BaseModel):
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


class RoomCreate(BaseModel):
    venue_id: str
    name: str = Field(min_length=1, max_length=200)
    width_m: float = Field(ge=1, le=500, default=20.0)
    length_m: float = Field(ge=1, le=500, default=15.0)
    color: str = Field(default="#6c757d", pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
    active: bool = True


class RoomUpdate(BaseModel):
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Editions
# ---------------------------------------------------------------------------


class ScheduleEventIn(BaseModel):
    id: str
    title: str
    start_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
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
    venue_id: str
    schedule: list[ScheduleEventIn] = Field(default_factory=list)
    exhibitors: list[int] = Field(default_factory=list)
    active: bool = True


class EditionUpdate(BaseModel):
    year: int | None = Field(default=None, ge=2020, le=2100)
    month: str | None = None
    friday: date | None = None
    saturday: date | None = None
    sunday: date | None = None
    venue_id: str | None = None
    schedule: list[ScheduleEventIn] | None = None
    exhibitors: list[int] | None = None
    active: bool | None = None


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
    friday: date
    saturday: date
    sunday: date
    venue: VenueOut
    schedule: list[ScheduleEventOut]
    producers: list[EditionItemOut]
    sponsors: list[EditionItemOut]
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


