"""Editions of the festival: the edition itself, its lineup items and scratchpad."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal
from typing import Literal, Self

from pydantic import ConfigDict, Field, model_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.organizations import SponsorTier
from app.schemas.types import EditionYear, ResourceKey

EditionType = Literal["festival", "bourse", "capsule_exchange"]


class EditionSummaryOut(ResponseModel):
    id: str
    year: int
    month: str
    edition_type: EditionType
    active: bool

    model_config = ConfigDict(from_attributes=True)


class EditionCreate(RequestModel):
    id: ResourceKey
    year: EditionYear
    month: str
    venue_id: str
    edition_type: EditionType = "festival"
    organizations: list[int] = Field(default_factory=list)
    sponsor_tiers: dict[int, SponsorTier] = Field(
        default_factory=dict,
        description="Sponsor level per lineup sponsor (organization id -> tier); sponsors without one are untiered.",
    )
    co_organizer_organization_id: int | None = None
    active: bool = True


class EditionUpdate(RequestModel):
    year: EditionYear | None = None
    month: str | None = None
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
    def reject_null_active_and_edition_type(self) -> Self:
        for field in ("edition_type", "active"):
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
    type: str
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
