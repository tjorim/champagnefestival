"""People (the contact records behind registrations, members and volunteers)."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal

from pydantic import ConfigDict, EmailStr, Field

from app.core.vocabularies import Locale
from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import MonthlyVisits, NonEmptyText200, Text20, Text50, Text300, Text2000


class PersonSummaryOut(ResponseModel):
    """Minimal person projection used in public-facing reservation responses.

    Omits sensitive/admin-only fields so that the public reservation endpoints
    cannot leak PII (address, roles, national register number, notes, etc.).
    """

    id: str
    name: str
    email: str
    phone: str
    preferred_language: Locale | None = None

    model_config = ConfigDict(from_attributes=True)


class RoleStretchOut(ResponseModel):
    """One stretch of holding a role; ``started_on`` is null when the start is unknown."""

    started_on: dt_date | None = None
    ended_on: dt_date | None = None


class PersonOut(ResponseModel):
    id: str
    name: str
    email: str
    phone: str
    preferred_language: Locale | None = None
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
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PersonAdminSummaryOut(ResponseModel):
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
    preferred_language: Locale | None = None
    address: str
    roles: list[str]
    retired_roles: dict[str, str] = {}
    role_history: dict[str, list[RoleStretchOut]] = {}
    inactivity_exempt: bool = False
    inactivity_exempt_note: str = ""
    visits_per_month: int | None
    notes: str
    anonymised: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PersonPaymentSummary(ResponseModel):
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
    reward_due: bool = False
    last_attended: dt_date | None = None
    inactivity_highlight: bool = False
    registration_count: int


class PeopleCountsOut(ResponseModel):
    total: int
    active: int
    inactive: int
    by_role: dict[str, int]


class PersonListEnvelope(ResponseModel):
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


class PersonCreate(RequestModel):
    name: NonEmptyText200
    email: EmailStr | None = None
    phone: Text50 = ""
    preferred_language: Locale | None = None
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
    preferred_language: Locale | None = None
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
