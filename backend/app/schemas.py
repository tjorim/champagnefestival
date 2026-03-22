from __future__ import annotations

"""Pydantic request / response schemas."""

from datetime import date as dt_date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing_extensions import Self


# ---------------------------------------------------------------------------
# Shared value types
# ---------------------------------------------------------------------------

OrderItemCategory = Literal["champagne", "food", "other"]
EditionType = Literal["festival", "bourse", "capsule_exchange"]
RegistrationStatus = Literal["pending", "confirmed", "cancelled"]
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


class EventCreate(BaseModel):
    edition_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    date: dt_date
    start_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    category: str = Field(min_length=1, max_length=50)
    registration_required: bool = False
    registrations_open_from: datetime | None = None
    max_capacity: int | None = Field(default=None, ge=1)
    active: bool = True


class EventUpdate(BaseModel):
    edition_id: str | None = Field(default=None, min_length=1, max_length=100)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    date: dt_date | None = None
    start_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    category: str | None = Field(default=None, min_length=1, max_length=50)
    registration_required: bool | None = None
    registrations_open_from: datetime | None = None
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
    max_capacity: int | None
    active: bool
    edition: EditionSummaryOut | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------


class RegistrationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str = Field(min_length=1, max_length=50)
    event_id: str = Field(min_length=1, max_length=64)
    guest_count: int = Field(ge=1, le=20)
    pre_orders: list[OrderItemBase] = Field(default_factory=list)
    notes: str = Field(default="", max_length=2000)
    honeypot: str = Field(default="", exclude=True)
    form_start_time: str = Field(default="", exclude=True)

    @field_validator("name", "phone", "event_id", "notes", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class RegistrationUpdate(BaseModel):
    status: RegistrationStatus | None = None
    payment_status: PaymentStatus | None = None
    table_id: str | None = None
    pre_orders: list[OrderItemBase] | None = None
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
    pre_orders: list[OrderItemOut]
    notes: str
    accessibility_note: str
    table_id: str | None
    status: RegistrationStatus
    payment_status: PaymentStatus
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
    pre_orders: list[OrderItemOut]
    accessibility_note: str
    table_id: str | None
    status: RegistrationStatus
    payment_status: PaymentStatus
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RegistrationGuestOut(BaseModel):
    """Registration data returned to visitors via the self-lookup endpoint."""

    id: str
    name: str
    event_id: str
    event_title: str
    guest_count: int
    pre_orders: list[OrderItemOut]
    status: RegistrationStatus
    payment_status: PaymentStatus
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RegistrationLookupRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def strip_email_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class RegistrationLookupRequestAccepted(BaseModel):
    ok: bool = True
    delivery_mode: Literal["email"] = "email"
    expires_in_minutes: int


class RegistrationAccessLookupRequest(BaseModel):
    token: str = Field(min_length=20)


class RegistrationAdminCreate(BaseModel):
    """Admin-only registration creation — skips spam checks, accepts person_id directly."""

    person_id: str = Field(min_length=1, max_length=64)
    event_id: str = Field(min_length=1, max_length=64)
    guest_count: int = Field(ge=1, le=20)
    pre_orders: list[OrderItemBase] = Field(default_factory=list)
    notes: str = Field(default="", max_length=2000)
    accessibility_note: str = Field(default="", max_length=2000)
    status: RegistrationStatus = "confirmed"

    @field_validator("event_id", "notes", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class VolunteerHelpPeriodIn(BaseModel):
    first_help_day: dt_date
    last_help_day: dt_date | None = None

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.last_help_day is not None and self.first_help_day > self.last_help_day:
            raise ValueError("first_help_day must be before or equal to last_help_day.")
        return self


class VolunteerCreate(BaseModel):

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


class VolunteerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    national_register_number: str | None = Field(
        default=None, min_length=1, max_length=20
    )
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


# ---------------------------------------------------------------------------
# Check-in
# ---------------------------------------------------------------------------


class CheckInGuestOut(BaseModel):
    """Minimal registration data returned by the public check-in GET endpoint.

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
    status: RegistrationStatus
    checked_in: bool
    checked_in_at: datetime | None
    strap_issued: bool

    model_config = {"from_attributes": True}


class CheckInRequest(BaseModel):
    token: str
    issue_strap: bool = True


class CheckInOut(BaseModel):
    registration: CheckInGuestOut
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
    contact_person: PersonSummaryOut | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Layouts
# ---------------------------------------------------------------------------


class LayoutCreate(BaseModel):
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
    color: str = Field(
        default="#6c757d", pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$"
    )
    active: bool = True


class RoomUpdate(BaseModel):
    name: str | None = None
    width_m: float | None = Field(default=None, ge=1, le=500)
    length_m: float | None = Field(default=None, ge=1, le=500)
    color: str | None = Field(
        default=None, pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$"
    )
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


class EditionCreate(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=2020, le=2100)
    month: str
    venue_id: str
    edition_type: EditionType = "festival"
    external_partner: str | None = Field(default=None, max_length=200)
    external_contact_name: str | None = Field(default=None, max_length=200)
    external_contact_email: EmailStr | None = None
    exhibitors: list[int] = Field(default_factory=list)
    active: bool = True


class EditionUpdate(BaseModel):
    year: int | None = Field(default=None, ge=2020, le=2100)
    month: str | None = None
    venue_id: str | None = None
    edition_type: EditionType | None = None
    external_partner: str | None = Field(default=None, max_length=200)
    external_contact_name: str | None = Field(default=None, max_length=200)
    external_contact_email: EmailStr | None = None
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
    edition_type: EditionType
    external_partner: str | None
    external_contact_name: str | None
    external_contact_email: EmailStr | None
    dates: list[dt_date] = Field(default_factory=list)
    venue: VenueOut
    events: list[EventOut]
    producers: list[EditionItemOut]
    sponsors: list[EditionItemOut]
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
