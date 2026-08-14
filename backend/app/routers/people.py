"""People CRUD endpoints (admin-only).

Business logic — identity normalisation, phone parsing, and the
create/update/delete/merge transitions — lives in
``app.services.people_service`` and is shared with ``app.mcp.admin.people``.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import Text, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.models import Event, Person, Registration
from app.schemas import PersonCreate, PersonOut, PersonUpdate
from app.services import people_service
from app.services.operational_search import (
    DEFAULT_RESULT_LIMIT,
    bounded_limit,
    person_search_order_by,
    person_search_predicate,
)
from app.utils import person_to_dict, registration_to_list_dict, roles_contains

router = APIRouter(
    prefix="/api/people",
    tags=["people"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(
    body: PersonCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await people_service.create_person(
        db, body=body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.get("", response_model=list[PersonOut])
async def list_people(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    role: str | None = Query(default=None, description="Filter by role (case-insensitive)"),
    active: bool | None = Query(default=None),
    pagination: Pagination = Depends(),
) -> list[dict]:
    stmt = select(Person)

    if active is not None:
        stmt = stmt.where(Person.active == active)

    if role:
        stmt = stmt.where(roles_contains(role))

    if q and (q_stripped := q.strip()):
        q_escaped = q_stripped.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        q_like = f"%{q_escaped}%"
        stmt = stmt.where(
            or_(
                person_search_predicate(name=q_stripped, email=q_stripped),
                Person.phone.ilike(q_like, escape="\\"),
                Person.address.ilike(q_like, escape="\\"),
                Person.national_register_number.ilike(q_like, escape="\\"),
                Person.eid_document_number.ilike(q_like, escape="\\"),
                Person.club_name.ilike(q_like, escape="\\"),
                Person.notes.ilike(q_like, escape="\\"),
                cast(Person.roles, Text).ilike(q_like, escape="\\"),
            )
        )
        limit = bounded_limit(pagination.limit or DEFAULT_RESULT_LIMIT)
        stmt = stmt.order_by(*person_search_order_by(name=q_stripped, email=q_stripped))
        stmt = stmt.offset((pagination.page - 1) * limit).limit(limit)
    else:
        stmt = stmt.order_by(Person.created_at.desc(), Person.id.desc())
        stmt = apply_pagination(stmt, pagination)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [person_to_dict(p) for p in rows]


@router.get("/{person_id}", response_model=PersonOut)
async def get_person(person_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    person = await people_service.get_person_or_404(db, person_id)
    return person_to_dict(person)


@router.put("/{person_id}", response_model=PersonOut)
async def update_person(
    person_id: str,
    body: PersonUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    person = await people_service.get_person_or_404(db, person_id)
    return await people_service.apply_person_update(
        db, person, body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.get("/{person_id}/registrations")
async def list_person_registrations(
    person_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    person = await people_service.get_person_or_404(db, person_id)

    result = await db.execute(
        select(Registration)
        .options(
            selectinload(Registration.event).selectinload(Event.edition),
            selectinload(Registration.event).selectinload(Event.products),
        )
        .where(Registration.person_id == person.id)
        .order_by(Registration.created_at.desc())
    )
    rows = result.scalars().all()
    return [registration_to_list_dict(r, person, r.event) for r in rows]


@router.post("/{person_id}/merge/{duplicate_id}", response_model=PersonOut)
async def merge_people(
    person_id: str,
    duplicate_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    """Merge duplicate_id into person_id (admin-only). See
    ``app.services.people_service.merge_people`` for the exact semantics."""
    if person_id == duplicate_id:
        raise HTTPException(status_code=400, detail="Cannot merge a person with themselves.")

    canonical = await people_service.get_person_or_404(db, person_id)
    duplicate = await people_service.get_person_or_404(db, duplicate_id)
    return await people_service.merge_people(
        db, canonical, duplicate, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(
    person_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    person = await people_service.get_person_or_404(db, person_id)
    await people_service.delete_person(db, person, actor=actor, request_id=getattr(request.state, "request_id", None))
