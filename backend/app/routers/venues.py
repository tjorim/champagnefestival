"""Venue management endpoints (admin only)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Venue
from app.schemas import VenueCreate, VenueOut, VenueUpdate
from app.utils import make_id, venue_to_dict

router = APIRouter(
    prefix="/api/venues",
    tags=["venues"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=VenueOut, status_code=status.HTTP_201_CREATED)
async def create_venue(body: VenueCreate, db: AsyncSession = Depends(get_db)) -> dict:
    v = Venue(
        id=make_id("venue"),
        name=body.name,
        address=body.address,
        city=body.city,
        postal_code=body.postal_code,
        country=body.country,
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return venue_to_dict(v)


@router.get("", response_model=list[VenueOut])
async def list_venues(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Venue).order_by(Venue.created_at))
    return [venue_to_dict(v) for v in result.scalars().all()]


@router.get("/{venue_id}", response_model=VenueOut)
async def get_venue(venue_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return venue_to_dict(await _get_or_404(db, venue_id))


@router.put("/{venue_id}", response_model=VenueOut)
async def update_venue(
    venue_id: str, body: VenueUpdate, db: AsyncSession = Depends(get_db)
) -> dict:
    v = await _get_or_404(db, venue_id)
    if body.name is not None:
        v.name = body.name
    if body.address is not None:
        v.address = body.address
    if body.city is not None:
        v.city = body.city
    if body.postal_code is not None:
        v.postal_code = body.postal_code
    if body.country is not None:
        v.country = body.country
    await db.commit()
    await db.refresh(v)
    return venue_to_dict(v)


@router.delete("/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_venue(venue_id: str, db: AsyncSession = Depends(get_db)) -> None:
    v = await _get_or_404(db, venue_id)
    await db.delete(v)
    await db.commit()


async def _get_or_404(db: AsyncSession, venue_id: str) -> Venue:
    result = await db.execute(select(Venue).where(Venue.id == venue_id))
    v = result.scalar_one_or_none()
    if v is None:
        raise HTTPException(status_code=404, detail="Venue not found.")
    return v
