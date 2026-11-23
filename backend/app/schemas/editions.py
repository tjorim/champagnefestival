"""Editions of the festival: the edition itself, its lineup items and scratchpad."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal
from typing import Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.core.vocabularies import EditionMonth, EditionType, OrganizationType, SponsorTier
from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import EditionMonthOut, EditionYear, ResourceKey


class EditionSummaryOut(ResponseModel):
    id: str
    year: int
    month: EditionMonthOut
    edition_type: EditionType
    active: bool

    model_config = ConfigDict(from_attributes=True)


# Older forms invited administrators to enter a month name in their own language.
_MONTH_ALIASES = {
    "januari": "january",
    "janvier": "january",
    "februari": "february",
    "février": "february",
    "maart": "march",
    "mars": "march",
    "avril": "april",
    "mei": "may",
    "mai": "may",
    "juni": "june",
    "juin": "june",
    "juli": "july",
    "juillet": "july",
    "augustus": "august",
    "août": "august",
    "oktober": "october",
    "octobre": "october",
    "novembre": "november",
    "décembre": "december",
}


class EditionMonthInput(RequestModel):
    @field_validator("month", mode="before", check_fields=False)
    @classmethod
    def normalize_month(cls, value: object) -> object:
        if isinstance(value, str):
            month = value.strip().lower()
            return _MONTH_ALIASES.get(month, month)
        return value


class EditionCreate(EditionMonthInput):
    id: ResourceKey
    year: EditionYear
    month: EditionMonth
    venue_id: str
    edition_type: EditionType = "festival"
    organizations: list[int] = Field(default_factory=list)
    sponsor_tiers: dict[int, SponsorTier] = Field(
        default_factory=dict,
        description="Sponsor level per lineup sponsor (organization id -> tier); sponsors without one are untiered.",
    )
    co_organizer_organization_id: int | None = None
    active: bool = True


class EditionUpdate(EditionMonthInput):
    year: EditionYear | None = None
    month: EditionMonth | None = None
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
    def reject_null_required_fields(self) -> Self:
        for field in ("month", "edition_type", "active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} may be omitted but cannot be null.")
        return self


class EditionItemOut(ResponseModel):
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
    type: OrganizationType
    sponsor_tier: SponsorTier | None = Field(
        default=None, description="Sponsor level for this edition; null for non-sponsors and untiered sponsors."
    )

    model_config = ConfigDict(from_attributes=True)


class EditionScratchpadUpdate(RequestModel):
    content: str = Field(max_length=20000)


class EditionScratchpadOut(ResponseModel):
    content: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EditionAttendanceStats(ResponseModel):
    edition_id: str
    year: int
    month: EditionMonthOut
    edition_type: EditionType
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
