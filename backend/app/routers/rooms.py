"""Room management endpoints (admin only)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Room, Venue
from app.schemas import RoomCreate, RoomOut, RoomUpdate
from app.utils import make_id, room_to_dict

router = APIRouter(
    prefix="/api/rooms",
    tags=["rooms"],
    dependencies=[Depends(require_admin)],
)


# ---------------------------------------------------------------------------
# Create room
# ---------------------------------------------------------------------------


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    venue = await db.execute(select(Venue).where(Venue.id == body.venue_id))
    if venue.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail=f"Venue '{body.venue_id}' not found.")

    r = Room(
        id=make_id("room"),
        venue_id=body.venue_id,
        name=body.name,
        width_m=body.width_m,
        length_m=body.length_m,
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
    if body.width_m is not None:
        r.width_m = body.width_m
    if body.length_m is not None:
        r.length_m = body.length_m
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
