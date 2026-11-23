"""Events of an edition."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from typing import Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.editions import EditionSummaryOut
from app.schemas.orders import OrderQuestionOut
from app.schemas.products import ProductOut, ProductPublicOut
from app.schemas.types import ClockTime, NonEmptyText50, ResourceKey, Text200, Text10000


class EventTextFields(RequestModel):
    """Per-language event title and description (#1222).

    Same contract as ``OrganizationDescription``: Dutch must be filled, the
    others are optional, and public reads fall back to Dutch. A blank text is
    stored as ``None``. Unlike an organisation, an event always has a title.
    """

    title_nl: Text200 | None = None
    title_fr: Text200 | None = None
    title_en: Text200 | None = None
    description_nl: Text10000 | None = None
    description_fr: Text10000 | None = None
    description_en: Text10000 | None = None

    @field_validator(
        "title_nl",
        "title_fr",
        "title_en",
        "description_nl",
        "description_fr",
        "description_en",
        mode="before",
    )
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.title_nl:
            raise ValueError("A title requires non-empty Dutch text.")
        if any((self.description_fr, self.description_en)) and not self.description_nl:
            raise ValueError("A description requires non-empty Dutch text.")
        return self


class EventCreate(EventTextFields):
    edition_id: ResourceKey
    date: dt_date
    start_time: ClockTime
    end_time: ClockTime | None = None
    category: NonEmptyText50
    volunteers_only: bool = False
    members_only: bool = False
    registration_required: bool = False
    registrations_open_from: datetime | None = None
    registrations_close_at: datetime | None = None
    active: bool = True

    @model_validator(mode="after")
    def check_text(self) -> Self:
        return self.validate_dutch()


class EventUpdate(EventTextFields):
    edition_id: ResourceKey | None = None
    date: dt_date | None = None
    start_time: ClockTime | None = None
    end_time: ClockTime | None = None
    category: NonEmptyText50 | None = None
    volunteers_only: bool | None = None
    members_only: bool | None = None
    registration_required: bool | None = None
    registrations_open_from: datetime | None = None
    registrations_close_at: datetime | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def reject_null_start_time(self) -> Self:
        if "start_time" in self.model_fields_set and self.start_time is None:
            raise ValueError("start_time may be omitted but cannot be null.")
        return self


class EventTextOut(ResponseModel):
    """The stored text of an event in every language.

    ``title``/``description`` on the enclosing model are the text resolved for
    the request locale (Dutch when none is requested), so clients that predate
    translations keep working.
    """

    title: str
    description: str
    title_nl: str | None = None
    title_fr: str | None = None
    title_en: str | None = None
    description_nl: str | None = None
    description_fr: str | None = None
    description_en: str | None = None


class EventOut(EventTextOut):
    id: str
    edition_id: str
    date: dt_date
    start_time: str
    end_time: str | None
    category: str
    volunteers_only: bool = False
    members_only: bool = False
    registration_required: bool
    registrations_open_from: datetime | None
    registrations_close_at: datetime | None
    active: bool
    edition: EditionSummaryOut | None = None
    order_questions: list[OrderQuestionOut] = Field(default_factory=list)
    products: list[ProductOut] = Field(default_factory=list)
    """Purchasable products only — see ProductOut. Empty means nothing to order."""
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventPublicOut(EventTextOut):
    """Visitor-facing event shape — see ProductPublicOut for why `products`
    differs from `EventOut.products`."""

    id: str
    edition_id: str
    date: dt_date
    start_time: str
    end_time: str | None
    category: str
    volunteers_only: bool = False
    members_only: bool = False
    registration_required: bool
    registrations_open_from: datetime | None
    registrations_close_at: datetime | None
    active: bool
    order_questions: list[OrderQuestionOut] = Field(default_factory=list)
    products: list[ProductPublicOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventCheckInStats(ResponseModel):
    """Guest counts for an event's live entrance display. `total`/`checked_in`
    are guest headcounts (sum of `guest_count`), not booking counts."""

    event_id: str
    event_title: str
    total: int
    checked_in: int
