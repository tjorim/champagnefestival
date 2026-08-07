"""Admin (write) MCP tool implementations for room management.

Mirrors ``app.routers.rooms``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.audit import write_audit_entry
from app.mcp.utils import get_or_error, validate_with_schema
from app.models import Layout, Room, Venue
from app.schemas import RoomCreate, RoomUpdate
from app.utils import make_id, room_to_dict


async def create_room(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    venue_id: str,
    width_m: float = 20.0,
    length_m: float = 15.0,
    color: str = "#6c757d",
    active: bool = True,
) -> dict:
    body = validate_with_schema(
        RoomCreate,
        name=name,
        venue_id=venue_id,
        width_m=width_m,
        length_m=length_m,
        color=color,
        active=active,
    )
    async with session_factory() as db:
        venue = await db.execute(select(Venue).where(Venue.id == body.venue_id))
        if venue.scalar_one_or_none() is None:
            raise ValueError(f"Venue '{body.venue_id}' not found.")

        r = Room(
            id=make_id("room"),
            venue_id=body.venue_id,
            name=body.name,
            width_m=body.width_m,
            length_m=body.length_m,
            color=body.color,
            active=body.active,
        )
        db.add(r)
        await write_audit_entry(
            db,
            actor=actor,
            action="room_created",
            resource_type="room",
            resource_id=r.id,
            details={"name": r.name, "venue_id": r.venue_id},
        )
        await db.commit()
        await db.refresh(r)
        return room_to_dict(r)


async def list_rooms(session_factory: Any) -> dict:
    async with session_factory() as db:
        result = await db.execute(select(Room).order_by(Room.created_at))
        return {"rooms": [room_to_dict(r) for r in result.scalars().all()]}


async def get_room(session_factory: Any, room_id: str) -> dict:
    async with session_factory() as db:
        r = await get_or_error(db, Room, room_id, f"Room '{room_id}' not found.")
        return room_to_dict(r)


async def update_room(
    session_factory: Any,
    actor: str,
    room_id: str,
    *,
    name: str | None = None,
    width_m: float | None = None,
    length_m: float | None = None,
    color: str | None = None,
    active: bool | None = None,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "name": name,
            "width_m": width_m,
            "length_m": length_m,
            "color": color,
            "active": active,
        }.items()
        if v is not None
    }
    body = validate_with_schema(RoomUpdate, **provided)
    async with session_factory() as db:
        r = await get_or_error(db, Room, room_id, f"Room '{room_id}' not found.")
        for field in body.model_fields_set:
            setattr(r, field, getattr(body, field))
        await write_audit_entry(
            db,
            actor=actor,
            action="room_updated",
            resource_type="room",
            resource_id=r.id,
            details={"fields_changed": sorted(body.model_fields_set)},
        )
        await db.commit()
        await db.refresh(r)
        return room_to_dict(r)


async def delete_room(session_factory: Any, actor: str, room_id: str) -> dict:
    async with session_factory() as db:
        r = await get_or_error(db, Room, room_id, f"Room '{room_id}' not found.")
        # Lock the room row so a concurrent layout creation (see layouts.create_layout
        # and copy_layout) can't insert a new layout for this room between our check
        # and the delete below, which would otherwise cascade-delete it silently.
        await db.execute(select(Room.id).where(Room.id == room_id).with_for_update())
        layouts_in_use = await db.execute(select(Layout).where(Layout.room_id == room_id).limit(1))
        if layouts_in_use.scalars().first() is not None:
            raise ValueError("Cannot delete: layouts are still using this room.")
        await db.delete(r)
        await write_audit_entry(
            db,
            actor=actor,
            action="room_deleted",
            resource_type="room",
            resource_id=room_id,
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": room_id}
