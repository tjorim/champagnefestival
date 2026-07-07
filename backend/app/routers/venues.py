"""Venue management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import Edition, Room, Venue
from app.schemas import VenueCreate, VenueOut, VenueUpdate
from app.utils import get_or_404, make_id, venue_to_dict

router = APIRouter(
    prefix="/api/venues",
    tags=["venues"],
)


@router.post("", response_model=VenueOut, status_code=status.HTTP_201_CREATED)
async def create_venue(
    body: VenueCreate,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    v = Venue(
        id=make_id("venue"),
        name=body.name,
        address=body.address,
        city=body.city,
        postal_code=body.postal_code,
        country=body.country,
        lat=body.lat,
        lng=body.lng,
    )
    db.add(v)
    await write_audit_entry(
        db,
        actor=actor,
        action="venue_created",
        resource_type="venue",
        resource_id=v.id,
        request_id=getattr(request.state, "request_id", None),
        details={"name": v.name},
    )
    await db.commit()
    await db.refresh(v)
    return venue_to_dict(v)


@router.get("", response_model=list[VenueOut])
async def list_venues(
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    stmt = select(Venue).order_by(Venue.created_at).offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return [venue_to_dict(v) for v in result.scalars().all()]


@router.get("/{venue_id}", response_model=VenueOut, dependencies=[Depends(require_admin)])
async def get_venue(venue_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return venue_to_dict(await get_or_404(db, Venue, venue_id, "Venue not found."))


@router.put("/{venue_id}", response_model=VenueOut)
async def update_venue(
    venue_id: str,
    body: VenueUpdate,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    v = await get_or_404(db, Venue, venue_id, "Venue not found.")
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
    if body.lat is not None:
        v.lat = body.lat
    if body.lng is not None:
        v.lng = body.lng
    if body.active is not None:
        v.active = body.active
    await write_audit_entry(
        db,
        actor=actor,
        action="venue_updated",
        resource_type="venue",
        resource_id=v.id,
        request_id=getattr(request.state, "request_id", None),
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(v)
    return venue_to_dict(v)


@router.delete("/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_venue(
    venue_id: str,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    v = await get_or_404(db, Venue, venue_id, "Venue not found.")
    in_use = await db.execute(select(Edition).where(Edition.venue_id == venue_id).limit(1))
    if in_use.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete: editions are still using this venue.",
        )
    rooms_in_use = await db.execute(select(Room).where(Room.venue_id == venue_id).limit(1))
    if rooms_in_use.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete: rooms are still using this venue.",
        )
    await db.delete(v)
    await write_audit_entry(
        db,
        actor=actor,
        action="venue_deleted",
        resource_type="venue",
        resource_id=venue_id,
        request_id=getattr(request.state, "request_id", None),
        details={},
    )
    await db.commit()
