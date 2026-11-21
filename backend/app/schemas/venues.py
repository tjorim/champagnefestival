"""Venues and the public venue plan."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime

from pydantic import ConfigDict

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import NonEmptyText200, Text20, Text100, Text200


class VenuePlanRoomOut(ResponseModel):
    id: str
    name: str
    width_m: float
    length_m: float
    color: str


class VenuePlanTableOut(ResponseModel):
    exclusive: bool = False
    id: str
    name: str
    capacity: int
    x: float
    y: float
    rotation: int
    table_type_id: str
    registration_ids: list[str]
    occupied_seats: int


class VenuePlanAreaOut(ResponseModel):
    id: str
    label: str
    icon: str
    x: float
    y: float
    rotation: int
    width_m: float
    length_m: float
    organization_id: int | None


class VenuePlanLayoutOut(ResponseModel):
    event_title: str
    id: str
    event_id: str
    date: dt_date | None
    label: str
    room: VenuePlanRoomOut | None
    tables: list[VenuePlanTableOut]
    areas: list[VenuePlanAreaOut]


class VenuePlanOut(ResponseModel):
    edition_id: str
    layouts: list[VenuePlanLayoutOut]


class VenueCreate(RequestModel):
    name: NonEmptyText200
    address: Text200 = ""
    city: Text100 = ""
    postal_code: Text20 = ""
    country: Text100 = ""
    lat: float = 0.0
    lng: float = 0.0
    active: bool = True


class VenueUpdate(RequestModel):
    name: NonEmptyText200 | None = None
    address: Text200 | None = None
    city: Text100 | None = None
    postal_code: Text20 | None = None
    country: Text100 | None = None
    lat: float | None = None
    lng: float | None = None
    active: bool | None = None


class VenueOut(ResponseModel):
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

    model_config = ConfigDict(from_attributes=True)
