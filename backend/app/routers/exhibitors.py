"""Exhibitor management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.models import Edition, Exhibitor, Person
from app.schemas import ExhibitorCreate, ExhibitorOut, ExhibitorUpdate
from app.utils import exhibitor_to_dict, get_or_404

router = APIRouter(prefix="/api/exhibitors", tags=["exhibitors"])


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


@router.get("", response_model=list[ExhibitorOut], dependencies=[Depends(require_admin)])
async def list_exhibitors(
    exhibitor_type: str | None = Query(default=None, alias="type"),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(),
) -> list[dict]:
    stmt = select(Exhibitor).order_by(Exhibitor.id)
    if exhibitor_type is not None:
        stmt = stmt.where(Exhibitor.type == exhibitor_type)
    stmt = apply_pagination(stmt, pagination)
    result = await db.execute(stmt)
    exhibitors = result.scalars().all()
    person_ids = [e.contact_person_id for e in exhibitors if e.contact_person_id]
    contacts = await _load_contacts_by_ids(db, person_ids)
    return [
        exhibitor_to_dict(e, contacts.get(e.contact_person_id) if e.contact_person_id else None) for e in exhibitors
    ]


@router.post(
    "",
    response_model=ExhibitorOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_exhibitor(
    body: ExhibitorCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    contact = await _load_contact(db, body.contact_person_id)
    if body.contact_person_id and contact is None:
        raise HTTPException(status_code=404, detail="Person not found.")
    e = Exhibitor(
        name=body.name,
        image=body.image,
        website=body.website,
        active=body.active,
        type=body.type,
        contact_person_id=body.contact_person_id,
    )
    db.add(e)
    await db.flush()
    await write_audit_entry(
        db,
        actor=actor,
        action="exhibitor_created",
        resource_type="exhibitor",
        resource_id=str(e.id),
        request_id=getattr(request.state, "request_id", None),
        details={"name": e.name, "type": e.type},
    )
    await db.commit()
    await db.refresh(e)
    return exhibitor_to_dict(e, contact)


@router.put("/{exhibitor_id}", response_model=ExhibitorOut, dependencies=[Depends(require_admin)])
async def update_exhibitor(
    exhibitor_id: int,
    body: ExhibitorUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    e = await get_or_404(db, Exhibitor, exhibitor_id, "Exhibitor not found.")
    if body.name is not None:
        e.name = body.name
    if body.image is not None:
        e.image = body.image
    if body.website is not None:
        e.website = body.website
    if body.active is not None:
        e.active = body.active
    if body.type is not None:
        e.type = body.type
    if "contact_person_id" in body.model_fields_set:
        if body.contact_person_id is not None:
            contact_check = await _load_contact(db, body.contact_person_id)
            if contact_check is None:
                raise HTTPException(status_code=404, detail="Person not found.")
        e.contact_person_id = body.contact_person_id
    await write_audit_entry(
        db,
        actor=actor,
        action="exhibitor_updated",
        resource_type="exhibitor",
        resource_id=str(e.id),
        request_id=getattr(request.state, "request_id", None),
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(e)
    contact = await _load_contact(db, e.contact_person_id)
    return exhibitor_to_dict(e, contact)


@router.delete(
    "/{exhibitor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_exhibitor(
    exhibitor_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    e = await get_or_404(db, Exhibitor, exhibitor_id, "Exhibitor not found.")
    editions_result = await db.execute(select(Edition))
    for edition in editions_result.scalars().all():
        if exhibitor_id in edition.exhibitors:
            edition.exhibitors = [eid for eid in edition.exhibitors if eid != exhibitor_id]
    await db.delete(e)
    await write_audit_entry(
        db,
        actor=actor,
        action="exhibitor_deleted",
        resource_type="exhibitor",
        resource_id=str(exhibitor_id),
        request_id=getattr(request.state, "request_id", None),
        details={},
    )
    await db.commit()
