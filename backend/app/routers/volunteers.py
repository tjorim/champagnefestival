"""Volunteer CRUD endpoints (admin-only).

Volunteers are stored in the people table as a subset with role='volunteer'.
This router only narrows which shared `Person` fields the volunteer admin UI
reads/writes; it does not define separate volunteer-only database columns.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Person
from app.schemas import VolunteerCreate, VolunteerOut, VolunteerUpdate
from app.utils import make_id, person_to_dict, roles_contains

router = APIRouter(
    prefix="/api/volunteers",
    tags=["volunteers"],
    dependencies=[Depends(require_admin)],
)


def _ensure_volunteer_role(person: Person) -> None:
    roles = set(person.roles or [])
    roles.add("volunteer")
    person.roles = sorted(roles)


async def _ensure_unique_fields(
    db: AsyncSession,
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    exclude_id: str | None = None,
) -> None:
    if national_register_number is not None:
        stmt = select(Person).where(
            Person.national_register_number == national_register_number
        )
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


@router.post("", response_model=VolunteerOut, status_code=status.HTTP_201_CREATED)
async def create_volunteer(
    body: VolunteerCreate, db: AsyncSession = Depends(get_db)
) -> dict:
    await _ensure_unique_fields(
        db,
        national_register_number=body.national_register_number,
        eid_document_number=body.eid_document_number,
    )

    person = Person(
        id=make_id("per"),
        name=body.name,
        address=body.address,
        national_register_number=body.national_register_number,
        eid_document_number=body.eid_document_number,
        active=body.active,
    )
    _ensure_volunteer_role(person)

    db.add(person)
    await db.commit()
    await db.refresh(person)
    return _to_volunteer_out(person)


@router.get("", response_model=list[VolunteerOut])
async def list_volunteers(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(
        default=None, description="Search by name, address, NISS, or eID doc number"
    ),
    active: bool | None = Query(default=None),
) -> list[dict]:
    stmt = select(Person).where(roles_contains("volunteer"))

    if active is not None:
        stmt = stmt.where(Person.active == active)

    if q:
        q_escaped = (
            q.strip().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        )
        q_like = f"%{q_escaped}%"
        stmt = stmt.where(
            or_(
                Person.name.ilike(q_like, escape="\\"),
                Person.address.ilike(q_like, escape="\\"),
                Person.national_register_number.ilike(q_like, escape="\\"),
                Person.eid_document_number.ilike(q_like, escape="\\"),
            )
        )

    result = await db.execute(stmt.order_by(Person.created_at.desc()))
    rows = result.scalars().all()
    return [_to_volunteer_out(v) for v in rows]


@router.get("/{volunteer_id}", response_model=VolunteerOut)
async def get_volunteer(volunteer_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    volunteer = await _get_or_404(db, volunteer_id)
    return _to_volunteer_out(volunteer)


@router.put("/{volunteer_id}", response_model=VolunteerOut)
async def update_volunteer(
    volunteer_id: str,
    body: VolunteerUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    volunteer = await _get_or_404(db, volunteer_id)

    if (
        "national_register_number" in body.model_fields_set
        and body.national_register_number is not None
    ):
        await _ensure_unique_fields(
            db,
            national_register_number=body.national_register_number,
            exclude_id=volunteer_id,
        )
    if (
        "eid_document_number" in body.model_fields_set
        and body.eid_document_number is not None
    ):
        await _ensure_unique_fields(
            db,
            eid_document_number=body.eid_document_number,
            exclude_id=volunteer_id,
        )

    for field in (
        "name",
        "address",
        "national_register_number",
        "eid_document_number",
        "active",
    ):
        if field in body.model_fields_set:
            setattr(volunteer, field, getattr(body, field))

    _ensure_volunteer_role(volunteer)

    await db.commit()
    await db.refresh(volunteer)
    return _to_volunteer_out(volunteer)


@router.delete("/{volunteer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_volunteer(
    volunteer_id: str, db: AsyncSession = Depends(get_db)
) -> None:
    volunteer = await _get_or_404(db, volunteer_id)
    await db.delete(volunteer)
    await db.commit()


async def _get_or_404(db: AsyncSession, volunteer_id: str) -> Person:
    result = await db.execute(select(Person).where(Person.id == volunteer_id))
    volunteer = result.scalar_one_or_none()
    if volunteer is None or "volunteer" not in volunteer.roles:
        raise HTTPException(status_code=404, detail="Volunteer not found.")
    return volunteer


def _to_volunteer_out(person: Person) -> dict:
    d = person_to_dict(person)
    return {
        "id": d["id"],
        "name": d["name"],
        "address": d["address"],
        "national_register_number": d["national_register_number"],
        "eid_document_number": d["eid_document_number"],
        "active": d["active"],
        "created_at": d["created_at"],
        "updated_at": d["updated_at"],
    }
