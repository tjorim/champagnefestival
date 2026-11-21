"""Waitlist entries and their scopes."""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict

from app.schemas.base import ResponseModel


class WaitlistEntryOut(ResponseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    product_id: str
    name: str
    email: str
    phone: str | None
    guest_count: int
    notes: str
    created_at: datetime
    handled_at: datetime | None


class WaitlistEntryAdminOut(WaitlistEntryOut):
    product_name: str
    event_id: str
    event_title: str


class WaitlistEntryListEnvelope(ResponseModel):
    """One page of the queue; ``total`` counts every entry matching the filters."""

    items: list[WaitlistEntryAdminOut]
    total: int
    limit: int
    page: int


class WaitlistEventScope(ResponseModel):
    id: str
    title: str
    outstanding: int
    total: int


class WaitlistProductScope(ResponseModel):
    id: str
    name: str
    event_id: str
    event_title: str
    outstanding: int
    total: int


class WaitlistScopes(ResponseModel):
    events: list[WaitlistEventScope]
    products: list[WaitlistProductScope]
