"""Sponsor management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Edition, Person, Sponsor
from app.schemas import SponsorCreate, SponsorOut, SponsorUpdate
from app.utils import sponsor_to_dict

router = APIRouter(prefix="/api/sponsors", tags=["sponsors"])


async def _load_contact(db: AsyncSession, person_id: str | None) -> Person | None:
    if not person_id:
        return None
    result = await db.execute(select(Person).where(Person.id == person_id))
    return result.scalar_one_or_none()


async def _load_contacts_by_ids(db: AsyncSession, ids: list[str]) -> dict[str, Person]:
    if not ids:
        return {}
    result = await db.execute(select(Person).where(Person.id.in_(ids)))
    return {p.id: p for p in result.scalars().all()}


@router.get("", response_model=list[SponsorOut], dependencies=[Depends(require_admin)])
async def list_sponsors(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Sponsor).order_by(Sponsor.id))
    sponsors = result.scalars().all()
    person_ids = [s.contact_person_id for s in sponsors if s.contact_person_id]
    contacts = await _load_contacts_by_ids(db, person_ids)
    return [sponsor_to_dict(s, contacts.get(s.contact_person_id)) for s in sponsors]


@router.post(
    "",
    response_model=SponsorOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_sponsor(body: SponsorCreate, db: AsyncSession = Depends(get_db)) -> dict:
    s = Sponsor(name=body.name, image=body.image, active=body.active, contact_person_id=body.contact_person_id)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    contact = await _load_contact(db, s.contact_person_id)
    return sponsor_to_dict(s, contact)


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
    if "contact_person_id" in body.model_fields_set:
        s.contact_person_id = body.contact_person_id
    await db.commit()
    await db.refresh(s)
    contact = await _load_contact(db, s.contact_person_id)
    return sponsor_to_dict(s, contact)


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
