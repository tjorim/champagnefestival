"""Rooms of a venue."""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import HexColor, NonEmptyText200, RoomDimension


class RoomCreate(RequestModel):
    venue_id: str
    name: NonEmptyText200
    # Required, not defaulted — a 20x15m default would silently masquerade as a
    # measured room dimension for whatever venue was actually entered (see #835).
    width_m: RoomDimension
    length_m: RoomDimension
    color: HexColor = "#6c757d"
    active: bool = True


class RoomUpdate(RequestModel):
    venue_id: str | None = None
    name: NonEmptyText200 | None = None
    width_m: RoomDimension | None = None
    length_m: RoomDimension | None = None
    color: HexColor | None = None
    active: bool | None = None


class RoomOut(ResponseModel):
    id: str
    venue_id: str
    name: str
    width_m: float
    length_m: float
    color: str
    active: bool
    dimensions_placeholder: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoomBulkCreate(RequestModel):
    """Create several rooms in one atomic transaction (#837).

    A failure partway through (e.g. an unknown ``venue_id`` on any item)
    leaves no room created. Pass ``idempotency_key`` to safely retry after a
    timeout or partial failure without risking duplicates.
    """

    items: list[RoomCreate] = Field(min_length=1, max_length=200)
    idempotency_key: NonEmptyText200 | None = None


class RoomBulkOut(ResponseModel):
    items: list[RoomOut]
