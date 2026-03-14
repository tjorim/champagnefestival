"""Room management endpoints (admin only)."""

import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Room
from app.schemas import RoomCreate, RoomOut, RoomUpdate
from app.utils import room_to_dict

router = APIRouter(
    prefix="/api/rooms",
    tags=["rooms"],
    dependencies=[Depends(require_admin)],
)


def _make_id() -> str:
    ts = int(time.time() * 1000)
    rand = secrets.token_hex(4)
    return f"room_{ts}_{rand}"


# ---------------------------------------------------------------------------
# Create room
# ---------------------------------------------------------------------------


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = Room(
        id=_make_id(),
        name=body.name,
        zone_type=body.zone_type,
        width_m=body.width_m,
        height_m=body.height_m,
        color=body.color,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return room_to_dict(r)


# ---------------------------------------------------------------------------
# List rooms
# ---------------------------------------------------------------------------


@router.get("", response_model=list[RoomOut])
async def list_rooms(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Room).order_by(Room.created_at))
    return [room_to_dict(r) for r in result.scalars().all()]


# ---------------------------------------------------------------------------
# Get single room
# ---------------------------------------------------------------------------


@router.get("/{room_id}", response_model=RoomOut)
async def get_room(room_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return room_to_dict(await _get_or_404(db, room_id))


# ---------------------------------------------------------------------------
# Update room
# ---------------------------------------------------------------------------


@router.put("/{room_id}", response_model=RoomOut)
async def update_room(
    room_id: str,
    body: RoomUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    r = await _get_or_404(db, room_id)

    if body.name is not None:
        r.name = body.name
    if body.zone_type is not None:
        r.zone_type = body.zone_type
    if body.width_m is not None:
        r.width_m = body.width_m
    if body.height_m is not None:
        r.height_m = body.height_m
    if body.color is not None:
        r.color = body.color

    await db.commit()
    await db.refresh(r)
    return room_to_dict(r)


# ---------------------------------------------------------------------------
# Delete room
# ---------------------------------------------------------------------------


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(room_id: str, db: AsyncSession = Depends(get_db)) -> None:
    r = await _get_or_404(db, room_id)
    await db.delete(r)
    await db.commit()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def _get_or_404(db: AsyncSession, room_id: str) -> Room:
    result = await db.execute(select(Room).where(Room.id == room_id))
    r = result.scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    return r
