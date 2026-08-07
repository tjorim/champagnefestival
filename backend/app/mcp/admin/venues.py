"""Admin (write) MCP tool implementations for venue management.

Mirrors ``app.routers.venues``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.audit import write_audit_entry
from app.mcp.utils import get_or_error, validate_with_schema
from app.models import Edition, Room, Venue
from app.schemas import VenueCreate, VenueUpdate
from app.utils import make_id, venue_to_dict


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
        v = Venue(
            id=make_id("venue"),
            name=body.name,
            address=body.address,
            city=body.city,
            postal_code=body.postal_code,
            country=body.country,
            lat=body.lat,
            lng=body.lng,
            active=body.active,
        )
        db.add(v)
        await write_audit_entry(
            db,
            actor=actor,
            action="venue_created",
            resource_type="venue",
            resource_id=v.id,
            details={"name": v.name},
        )
        await db.commit()
        await db.refresh(v)
        return venue_to_dict(v)


async def list_venues(session_factory: Any) -> dict:
    async with session_factory() as db:
        result = await db.execute(select(Venue).order_by(Venue.created_at))
        return {"venues": [venue_to_dict(v) for v in result.scalars().all()]}


async def get_venue(session_factory: Any, venue_id: str) -> dict:
    async with session_factory() as db:
        v = await get_or_error(db, Venue, venue_id, f"Venue '{venue_id}' not found.")
        return venue_to_dict(v)


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
        v = await get_or_error(db, Venue, venue_id, f"Venue '{venue_id}' not found.")
        for field in body.model_fields_set:
            setattr(v, field, getattr(body, field))
        await write_audit_entry(
            db,
            actor=actor,
            action="venue_updated",
            resource_type="venue",
            resource_id=v.id,
            details={"fields_changed": sorted(body.model_fields_set)},
        )
        await db.commit()
        await db.refresh(v)
        return venue_to_dict(v)


async def delete_venue(session_factory: Any, actor: str, venue_id: str) -> dict:
    async with session_factory() as db:
        v = await get_or_error(db, Venue, venue_id, f"Venue '{venue_id}' not found.")
        # Lock the venue row so a concurrent edition/room creation (which validates
        # the venue exists before inserting) can't race this delete: whichever
        # transaction locks the venue first is the one the other serializes behind.
        await db.execute(select(Venue.id).where(Venue.id == venue_id).with_for_update())
        in_use = await db.execute(select(Edition).where(Edition.venue_id == venue_id).limit(1))
        if in_use.scalars().first() is not None:
            raise ValueError("Cannot delete: editions are still using this venue.")
        rooms_in_use = await db.execute(select(Room).where(Room.venue_id == venue_id).limit(1))
        if rooms_in_use.scalars().first() is not None:
            raise ValueError("Cannot delete: rooms are still using this venue.")
        await db.delete(v)
        await write_audit_entry(
            db,
            actor=actor,
            action="venue_deleted",
            resource_type="venue",
            resource_id=venue_id,
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": venue_id}
