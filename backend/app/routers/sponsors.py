"""Sponsor management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Edition, Sponsor
from app.schemas import SponsorCreate, SponsorOut, SponsorUpdate
from app.utils import sponsor_to_dict

router = APIRouter(prefix="/api/sponsors", tags=["sponsors"])


@router.get("", response_model=list[SponsorOut], dependencies=[Depends(require_admin)])
async def list_sponsors(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Sponsor).order_by(Sponsor.id))
    return [sponsor_to_dict(s) for s in result.scalars().all()]


@router.post(
    "",
    response_model=SponsorOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_sponsor(body: SponsorCreate, db: AsyncSession = Depends(get_db)) -> dict:
    s = Sponsor(name=body.name, image=body.image, active=body.active)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return sponsor_to_dict(s)


@router.put("/{sponsor_id}", response_model=SponsorOut, dependencies=[Depends(require_admin)])
async def update_sponsor(
    sponsor_id: int, body: SponsorUpdate, db: AsyncSession = Depends(get_db)
) -> dict:
    s = await _get_or_404(db, sponsor_id)
    if body.name is not None:
        s.name = body.name
    if body.image is not None:
        s.image = body.image
    if body.active is not None:
        s.active = body.active
    await db.commit()
    await db.refresh(s)
    return sponsor_to_dict(s)


@router.delete(
    "/{sponsor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_sponsor(sponsor_id: int, db: AsyncSession = Depends(get_db)) -> None:
    s = await _get_or_404(db, sponsor_id)
    result = await db.execute(select(Edition).where(Edition.active.is_(True)))
    for edition in result.scalars().all():
        if sponsor_id in edition.get_sponsors():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Sponsor {sponsor_id} is still linked to an active edition.",
            )
    await db.delete(s)
    await db.commit()


async def _get_or_404(db: AsyncSession, sponsor_id: int) -> Sponsor:
    result = await db.execute(select(Sponsor).where(Sponsor.id == sponsor_id))
    s = result.scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Sponsor not found.")
    return s
