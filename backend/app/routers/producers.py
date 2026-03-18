"""Producer management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Edition, Person, Producer
from app.schemas import ProducerCreate, ProducerOut, ProducerUpdate
from app.utils import producer_to_dict

router = APIRouter(prefix="/api/producers", tags=["producers"])


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


@router.get("", response_model=list[ProducerOut], dependencies=[Depends(require_admin)])
async def list_producers(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Producer).order_by(Producer.id))
    producers = result.scalars().all()
    person_ids = [p.contact_person_id for p in producers if p.contact_person_id]
    contacts = await _load_contacts_by_ids(db, person_ids)
    return [producer_to_dict(p, contacts.get(p.contact_person_id)) for p in producers]


@router.post(
    "",
    response_model=ProducerOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_producer(body: ProducerCreate, db: AsyncSession = Depends(get_db)) -> dict:
    p = Producer(name=body.name, image=body.image, website=body.website, active=body.active, contact_person_id=body.contact_person_id)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    contact = await _load_contact(db, p.contact_person_id)
    return producer_to_dict(p, contact)


@router.put("/{producer_id}", response_model=ProducerOut, dependencies=[Depends(require_admin)])
async def update_producer(
    producer_id: int, body: ProducerUpdate, db: AsyncSession = Depends(get_db)
) -> dict:
    p = await _get_or_404(db, producer_id)
    if body.name is not None:
        p.name = body.name
    if body.image is not None:
        p.image = body.image
    if body.website is not None:
        p.website = body.website
    if body.active is not None:
        p.active = body.active
    if "contact_person_id" in body.model_fields_set:
        p.contact_person_id = body.contact_person_id
    await db.commit()
    await db.refresh(p)
    contact = await _load_contact(db, p.contact_person_id)
    return producer_to_dict(p, contact)


@router.delete(
    "/{producer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_producer(producer_id: int, db: AsyncSession = Depends(get_db)) -> None:
    p = await _get_or_404(db, producer_id)
    # Check if any edition still references this producer
    result = await db.execute(select(Edition).where(Edition.active.is_(True)))
    for edition in result.scalars().all():
        if producer_id in edition.get_producers():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Producer {producer_id} is still linked to an active edition.",
            )
    await db.delete(p)
    await db.commit()


async def _get_or_404(db: AsyncSession, producer_id: int) -> Producer:
    result = await db.execute(select(Producer).where(Producer.id == producer_id))
    p = result.scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="Producer not found.")
    return p
