"""Shared application-service operations for venues.

Used by both ``app.routers.venues`` (REST) and ``app.mcp.admin.venues`` (MCP).
See ``app/services/layouts_service.py`` for the pattern this follows and
``app/services/errors.py`` for the exception convention each adapter
translates at its own boundary.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Edition, Room, Venue
from app.schemas import VenueCreate, VenueUpdate
from app.services.errors import ConflictError, NotFoundError
from app.utils import make_id, venue_to_dict


async def create_venue(db: AsyncSession, *, actor: str, body: VenueCreate, request_id: str | None = None) -> dict:
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
        request_id=request_id,
        details={"name": v.name},
    )
    await db.commit()
    await db.refresh(v)
    return venue_to_dict(v)


async def list_venues(db: AsyncSession, *, limit: int | None = None, offset: int = 0) -> list[dict]:
    stmt = select(Venue).order_by(Venue.created_at).offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return [venue_to_dict(v) for v in result.scalars().all()]


async def get_venue(db: AsyncSession, venue_id: str) -> dict:
    v = await db.get(Venue, venue_id)
    if v is None:
        raise NotFoundError(f"Venue '{venue_id}' not found.")
    return venue_to_dict(v)


async def update_venue(
    db: AsyncSession, *, actor: str, venue_id: str, body: VenueUpdate, request_id: str | None = None
) -> dict:
    v = await db.get(Venue, venue_id)
    if v is None:
        raise NotFoundError(f"Venue '{venue_id}' not found.")
    for field in body.model_fields_set:
        setattr(v, field, getattr(body, field))
    await write_audit_entry(
        db,
        actor=actor,
        action="venue_updated",
        resource_type="venue",
        resource_id=v.id,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(v)
    return venue_to_dict(v)


async def delete_venue(db: AsyncSession, *, actor: str, venue_id: str, request_id: str | None = None) -> dict:
    v = await db.get(Venue, venue_id)
    if v is None:
        raise NotFoundError(f"Venue '{venue_id}' not found.")
    # Lock the venue row so a concurrent edition/room creation (which validates
    # the venue exists before inserting) can't race this delete: whichever
    # transaction locks the venue first is the one the other serializes behind.
    await db.execute(select(Venue.id).where(Venue.id == venue_id).with_for_update())
    in_use = await db.execute(select(Edition).where(Edition.venue_id == venue_id).limit(1))
    if in_use.scalars().first() is not None:
        raise ConflictError("Cannot delete: editions are still using this venue.")
    rooms_in_use = await db.execute(select(Room).where(Room.venue_id == venue_id).limit(1))
    if rooms_in_use.scalars().first() is not None:
        raise ConflictError("Cannot delete: rooms are still using this venue.")
    await db.delete(v)
    await write_audit_entry(
        db,
        actor=actor,
        action="venue_deleted",
        resource_type="venue",
        resource_id=venue_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "id": venue_id}
