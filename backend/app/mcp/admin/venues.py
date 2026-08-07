"""Admin (write) MCP tool implementations for venue management.

Mirrors ``app.routers.venues``. Business logic lives in
``app.services.venues_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import validate_with_schema
from app.schemas import VenueCreate, VenueUpdate
from app.services import venues_service
from app.services.errors import ServiceError


async def create_venue(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    address: str = "",
    city: str = "",
    postal_code: str = "",
    country: str = "",
    lat: float = 0.0,
    lng: float = 0.0,
    active: bool = True,
) -> dict:
    body = validate_with_schema(
        VenueCreate,
        name=name,
        address=address,
        city=city,
        postal_code=postal_code,
        country=country,
        lat=lat,
        lng=lng,
        active=active,
    )
    async with session_factory() as db:
        return await venues_service.create_venue(db, actor=actor, body=body)


async def list_venues(session_factory: Any) -> dict:
    async with session_factory() as db:
        return {"venues": await venues_service.list_venues(db)}


async def get_venue(session_factory: Any, venue_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await venues_service.get_venue(db, venue_id)
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc


async def update_venue(
    session_factory: Any,
    actor: str,
    venue_id: str,
    *,
    name: str | None = None,
    address: str | None = None,
    city: str | None = None,
    postal_code: str | None = None,
    country: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    active: bool | None = None,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "name": name,
            "address": address,
            "city": city,
            "postal_code": postal_code,
            "country": country,
            "lat": lat,
            "lng": lng,
            "active": active,
        }.items()
        if v is not None
    }
    body = validate_with_schema(VenueUpdate, **provided)
    async with session_factory() as db:
        try:
            return await venues_service.update_venue(db, actor=actor, venue_id=venue_id, body=body)
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc


async def delete_venue(session_factory: Any, actor: str, venue_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await venues_service.delete_venue(db, actor=actor, venue_id=venue_id)
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc
