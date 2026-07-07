"""Member CRUD endpoints (admin-only).

Members are stored in the people table as a subset with role='member'.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.live import live_bus
from app.live import mapping as live_mapping
from app.models import Event, Person, Registration
from app.schemas import PersonCreate, PersonOut, PersonUpdate
from app.utils import get_or_404, make_id, person_to_dict, roles_contains

router = APIRouter(
    prefix="/api/members",
    tags=["members"],
    dependencies=[Depends(require_admin)],
)
logger = logging.getLogger(__name__)


def _normalise_roles(roles: list[str]) -> list[str]:
    return sorted({r.strip().lower() for r in roles if r and r.strip()})


def _normalise_optional_identity(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _ensure_member_role(person: Person) -> None:
    roles = set(person.roles or [])
    roles.add("member")
    person.roles = sorted(roles)


def _has_member_role(person: Person) -> bool:
    return "member" in (person.roles or [])


async def _ensure_unique_fields(
    db: AsyncSession,
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    exclude_id: str | None = None,
) -> None:
    if national_register_number is not None:
        stmt = select(Person).where(Person.national_register_number == national_register_number)
        if exclude_id:
            stmt = stmt.where(Person.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="Person with this national register number already exists.",
            )

    if eid_document_number is not None:
        stmt = select(Person).where(Person.eid_document_number == eid_document_number)
        if exclude_id:
            stmt = stmt.where(Person.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="Person with this eID document number already exists.",
            )


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_member(
    body: PersonCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    nrr = _normalise_optional_identity(body.national_register_number)
    eid = _normalise_optional_identity(body.eid_document_number)
    await _ensure_unique_fields(
        db,
        national_register_number=nrr,
        eid_document_number=eid,
    )

    person = Person(
        id=make_id("per"),
        name=body.name,
        email=str(body.email).lower().strip() if body.email else "",
        phone=body.phone,
        address=body.address,
        national_register_number=nrr,
        eid_document_number=eid,
        visits_per_month=body.visits_per_month,
        club_name=body.club_name,
        notes=body.notes,
        active=body.active,
    )
    person.roles = _normalise_roles(body.roles)
    _ensure_member_role(person)

    db.add(person)
    await write_audit_entry(
        db,
        actor=actor,
        action="member_created",
        resource_type="person",
        resource_id=person.id,
        request_id=getattr(request.state, "request_id", None),
        details={"roles": person.roles},
    )
    await db.commit()
    await db.refresh(person)
    return person_to_dict(person)


@router.get("", response_model=list[PersonOut])
async def list_members(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    pagination: Pagination = Depends(),
) -> list[dict]:
    stmt = select(Person).where(roles_contains("member"))

    if active is not None:
        stmt = stmt.where(Person.active == active)

    if q:
        q_escaped = q.strip().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        q_like = f"%{q_escaped}%"
        stmt = stmt.where(
            or_(
                Person.name.ilike(q_like, escape="\\"),
                Person.email.ilike(q_like, escape="\\"),
                Person.phone.ilike(q_like, escape="\\"),
                Person.address.ilike(q_like, escape="\\"),
                Person.club_name.ilike(q_like, escape="\\"),
                Person.notes.ilike(q_like, escape="\\"),
            )
        )

    stmt = stmt.order_by(Person.created_at.desc(), Person.id.desc())
    stmt = apply_pagination(stmt, pagination)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [person_to_dict(p) for p in rows]


@router.get("/{person_id}", response_model=PersonOut)
async def get_member(person_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    person = await _get_member_or_404(db, person_id)
    return person_to_dict(person)


@router.put("/{person_id}", response_model=PersonOut)
async def update_member(
    person_id: str,
    body: PersonUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    person = await _get_member_or_404(db, person_id)

    for field in (
        "name",
        "phone",
        "address",
        "visits_per_month",
        "club_name",
        "notes",
        "active",
    ):
        if field in body.model_fields_set:
            setattr(person, field, getattr(body, field))

    if "email" in body.model_fields_set:
        person.email = str(body.email).lower().strip() if body.email else ""

    nrr_in_set = "national_register_number" in body.model_fields_set
    eid_in_set = "eid_document_number" in body.model_fields_set
    nrr = _normalise_optional_identity(body.national_register_number) if nrr_in_set else None
    eid = _normalise_optional_identity(body.eid_document_number) if eid_in_set else None

    if nrr_in_set and nrr is not None:
        await _ensure_unique_fields(
            db,
            national_register_number=nrr,
            exclude_id=person.id,
        )
    if eid_in_set and eid is not None:
        await _ensure_unique_fields(
            db,
            eid_document_number=eid,
            exclude_id=person.id,
        )

    if nrr_in_set:
        person.national_register_number = nrr
    if eid_in_set:
        person.eid_document_number = eid

    if body.roles is not None:
        person.roles = _normalise_roles(body.roles)
    _ensure_member_role(person)

    await write_audit_entry(
        db,
        actor=actor,
        action="member_updated",
        resource_type="person",
        resource_id=person.id,
        request_id=getattr(request.state, "request_id", None),
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(person)
    return person_to_dict(person)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(
    person_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    person = await _get_member_or_404(db, person_id)
    result = await db.execute(
        select(Registration)
        .options(selectinload(Registration.event).selectinload(Event.edition))
        .where(Registration.person_id == person_id)
    )
    registrations = result.scalars().all()
    registration_scopes = [
        {
            "registration_id": registration.id,
            "event_id": registration.event_id,
            "edition_id": registration.event.edition_id,
        }
        for registration in registrations
    ]
    for registration in registrations:
        await db.delete(registration)
    await db.delete(person)
    await write_audit_entry(
        db,
        actor=actor,
        action="member_deleted",
        resource_type="person",
        resource_id=person_id,
        request_id=getattr(request.state, "request_id", None),
        details={"deleted_registration_count": len(registrations)},
    )
    await db.commit()
    for scope in registration_scopes:
        try:
            await live_bus.publish(live_mapping.registration_changed(action="deleted", **scope))
        except Exception:
            logger.warning(
                "live_bus.publish failed for deleted registration %s", scope["registration_id"], exc_info=True
            )


async def _get_member_or_404(db: AsyncSession, person_id: str) -> Person:
    person = await get_or_404(db, Person, person_id, "Member not found.")
    if not _has_member_role(person):
        raise HTTPException(status_code=404, detail="Member not found.")
    return person
