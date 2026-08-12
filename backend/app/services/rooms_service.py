"""Shared application-service operations for rooms.

Used by both ``app.routers.rooms`` (REST) and ``app.mcp.admin.rooms`` (MCP).
See ``app/services/layouts_service.py`` for the pattern this follows and
``app/services/errors.py`` for the exception convention each adapter
translates at its own boundary.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Layout, Room, Venue
from app.schemas import RoomCreate, RoomUpdate
from app.services.errors import ConflictError, NotFoundError
from app.utils import make_id, room_to_dict


async def create_room(db: AsyncSession, *, actor: str, body: RoomCreate, request_id: str | None = None) -> dict:
    venue = await db.execute(select(Venue).where(Venue.id == body.venue_id))
    if venue.scalar_one_or_none() is None:
        raise NotFoundError(f"Venue '{body.venue_id}' not found.")

    r = Room(
        id=make_id("room"),
        venue_id=body.venue_id,
        name=body.name,
        width_m=body.width_m,
        length_m=body.length_m,
        color=body.color,
        active=body.active,
        dimensions_placeholder=False,
    )
    db.add(r)
    await write_audit_entry(
        db,
        actor=actor,
        action="room_created",
        resource_type="room",
        resource_id=r.id,
        request_id=request_id,
        details={"name": r.name, "venue_id": r.venue_id},
    )
    await db.commit()
    await db.refresh(r)
    return room_to_dict(r)


async def list_rooms(db: AsyncSession, venue_id: str | None = None) -> list[dict]:
    stmt = select(Room).order_by(Room.created_at, Room.id)
    if venue_id:
        stmt = stmt.where(Room.venue_id == venue_id)
    result = await db.execute(stmt)
    return [room_to_dict(r) for r in result.scalars().all()]


async def get_room(db: AsyncSession, room_id: str) -> dict:
    r = await db.get(Room, room_id)
    if r is None:
        raise NotFoundError(f"Room '{room_id}' not found.")
    return room_to_dict(r)


async def update_room(
    db: AsyncSession, *, actor: str, room_id: str, body: RoomUpdate, request_id: str | None = None
) -> dict:
    r = await db.get(Room, room_id)
    if r is None:
        raise NotFoundError(f"Room '{room_id}' not found.")
    if "venue_id" in body.model_fields_set:
        venue = await db.execute(select(Venue).where(Venue.id == body.venue_id))
        if venue.scalar_one_or_none() is None:
            raise NotFoundError(f"Venue '{body.venue_id}' not found.")
    for field in body.model_fields_set:
        setattr(r, field, getattr(body, field))
    # An explicit width/length update means the value is now a deliberate,
    # measured dimension rather than an unconfirmed placeholder.
    if "width_m" in body.model_fields_set or "length_m" in body.model_fields_set:
        r.dimensions_placeholder = False
    await write_audit_entry(
        db,
        actor=actor,
        action="room_updated",
        resource_type="room",
        resource_id=r.id,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(r)
    return room_to_dict(r)


async def delete_room(db: AsyncSession, *, actor: str, room_id: str, request_id: str | None = None) -> dict:
    r = await db.get(Room, room_id)
    if r is None:
        raise NotFoundError(f"Room '{room_id}' not found.")
    # Lock the room row so a concurrent layout creation (see layouts_service.create_layout
    # and copy_layout) can't insert a new layout for this room between our check
    # and the delete below, which would otherwise cascade-delete it silently.
    await db.execute(select(Room.id).where(Room.id == room_id).with_for_update())
    layouts_in_use = await db.execute(select(Layout).where(Layout.room_id == room_id).limit(1))
    if layouts_in_use.scalars().first() is not None:
        raise ConflictError("Cannot delete: layouts are still using this room.")
    await db.delete(r)
    await write_audit_entry(
        db,
        actor=actor,
        action="room_deleted",
        resource_type="room",
        resource_id=room_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "id": room_id}
