"""Edition views that embed events, the venue and the lineup: detail, public, stands and plan."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime

from pydantic import ConfigDict, Field

from app.schemas.base import ResponseModel
from app.schemas.editions import EditionItemOut, EditionType
from app.schemas.events import EventOut, EventPublicOut
from app.schemas.types import EditionMonthOut
from app.schemas.venues import VenueOut


class EditionOut(ResponseModel):
    id: str
    year: int
    month: EditionMonthOut
    edition_type: EditionType
    dates: list[dt_date] = Field(default_factory=list)
    venue: VenueOut
    events: list[EventOut]
    organizations: list[int] = Field(
        default_factory=list, description="The lineup organization ids in admin-defined order."
    )
    producers: list[EditionItemOut]
    sponsors: list[EditionItemOut] = Field(description="Ordered by sponsor tier (main first), then lineup order.")
    vendors: list[EditionItemOut]
    co_organizer: EditionItemOut | None = None
    flyer_image: str | None = Field(default=None, description="Uploaded flyer path, or null for the static default.")
    hero_image: str | None = Field(
        default=None, description="Uploaded hero photo path, or null for the static default."
    )
    share_image: str | None = Field(
        default=None, description="Uploaded 1200x630 sharing image path (`og:image`), or null for the default."
    )
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EditionPublicOut(ResponseModel):
    """Returned by the unauthenticated /api/editions/active and /upcoming
    endpoints — events carry EventPublicOut, never the admin product shape."""

    id: str
    year: int
    month: EditionMonthOut
    edition_type: EditionType
    dates: list[dt_date] = Field(default_factory=list)
    venue: VenueOut
    events: list[EventPublicOut]
    producers: list[EditionItemOut]
    sponsors: list[EditionItemOut] = Field(description="Ordered by sponsor tier (main first), then lineup order.")
    vendors: list[EditionItemOut]
    co_organizer: EditionItemOut | None = None
    flyer_image: str | None = Field(default=None, description="Uploaded flyer path, or null for the static default.")
    hero_image: str | None = Field(
        default=None, description="Uploaded hero photo path, or null for the static default."
    )
    share_image: str | None = Field(
        default=None, description="Uploaded 1200x630 sharing image path (`og:image`), or null for the default."
    )
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StandOut(ResponseModel):
    """One stand of one organization on one festival day (public subset of an ``Area``).

    Deliberately carries no coordinates, size, icon or layout/area ids: the
    public list answers "where is X?" by label, room and day only.
    """

    event_id: str
    date: dt_date
    room_name: str
    label: str


class OrganizationStandsOut(ResponseModel):
    organization_id: int
    name: str
    stands: list[StandOut]


class EditionStandsOut(ResponseModel):
    """Returned by the unauthenticated ``GET /api/editions/{id}/stands``.

    Only lineup organizations that have at least one stand appear; there are no
    tables, registrations, guests, capacities or allocations in this shape.
    """

    edition_id: str
    organizations: list[OrganizationStandsOut]


class PlanAreaOut(ResponseModel):
    """One area (stand, stage, entrance, catering, ...) of the public floor plan.

    Geometry follows ``docs/floor-plan-coordinates.md``. Deliberately has no layout id.
    """

    id: str
    label: str
    icon: str
    x: float
    y: float
    rotation: int
    width_m: float
    length_m: float
    organization_id: int | None


class PlanRoomOut(ResponseModel):
    id: str
    name: str
    width_m: float
    length_m: float
    color: str
    areas: list[PlanAreaOut]


class PlanDayOut(ResponseModel):
    event_id: str
    date: dt_date
    rooms: list[PlanRoomOut]


class EditionPlanOut(ResponseModel):
    """Returned by the unauthenticated ``GET /api/editions/{id}/plan`` (#1253).

    Only rooms and areas: there are no tables, registrations, guests, capacities
    or allocations in this shape.
    """

    edition_id: str
    days: list[PlanDayOut]
