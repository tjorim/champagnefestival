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
from app.services.idempotency import (
    check_idempotency_key,
    commit_with_idempotency_guard,
    hash_request,
    record_idempotency_key,
)
from app.utils import make_id, room_to_dict

_BULK_SCOPE = "rooms.bulk_create"


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


async def bulk_create_rooms(
    db: AsyncSession,
    *,
    actor: str,
    items: list[RoomCreate],
    idempotency_key: str | None = None,
    request_id: str | None = None,
) -> dict:
    """Create several rooms in a single transaction; all-or-nothing (#837).

    See ``app.services.idempotency`` for the retry-safety contract of
    ``idempotency_key``.
    """
    request_hash = hash_request([item.model_dump(mode="json") for item in items])
    if idempotency_key:
        cached = await check_idempotency_key(db, scope=_BULK_SCOPE, key=idempotency_key, request_hash=request_hash)
        if cached is not None:
            return cached

    venue_ids = {item.venue_id for item in items}
    found = await db.execute(select(Venue.id).where(Venue.id.in_(venue_ids)))
    missing = venue_ids - set(found.scalars().all())
    if missing:
        raise NotFoundError(f"Venue(s) not found: {sorted(missing)}.")

    rows = [
        Room(
            id=make_id("room"),
            venue_id=item.venue_id,
            name=item.name,
            width_m=item.width_m,
            length_m=item.length_m,
            color=item.color,
            active=item.active,
            dimensions_placeholder=False,
        )
        for item in items
    ]
    db.add_all(rows)
    await db.flush()

    for r in rows:
        await write_audit_entry(
            db,
            actor=actor,
            action="room_created",
            resource_type="room",
            resource_id=r.id,
            request_id=request_id,
            details={"name": r.name, "venue_id": r.venue_id, "bulk": True},
        )

    response = {"items": [room_to_dict(r) for r in rows]}
    if idempotency_key:
        record_idempotency_key(
            db, scope=_BULK_SCOPE, key=idempotency_key, actor=actor, request_hash=request_hash, response_body=response
        )
    await commit_with_idempotency_guard(db, idempotency_key=idempotency_key)
    return response


async def list_rooms(db: AsyncSession, venue_id: str | None = None) -> list[dict]:
    stmt = select(Room).order_by(Room.created_at, Room.id)
    if venue_id is not None:
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
