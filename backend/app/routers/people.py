"""People CRUD endpoints (admin-only)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Person
from app.schemas import PersonCreate, PersonOut, PersonUpdate
from app.utils import make_id, person_to_dict

router = APIRouter(
    prefix="/api/people",
    tags=["people"],
    dependencies=[Depends(require_admin)],
)


def _normalise_roles(roles: list[str]) -> list[str]:
    return sorted({r.strip().lower() for r in roles if r and r.strip()})


def _validate_help_days(first_help_day, last_help_day) -> None:
    if first_help_day is not None and last_help_day is not None and first_help_day > last_help_day:
        raise HTTPException(
            status_code=400,
            detail="first_help_day must be before or equal to last_help_day.",
        )


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(body: PersonCreate, db: AsyncSession = Depends(get_db)) -> dict:
    _validate_help_days(body.first_help_day, body.last_help_day)

    person = Person(
        id=make_id("per"),
        name=body.name,
        email=str(body.email).lower().strip() if body.email else "",
        phone=body.phone,
        address=body.address,
        first_help_day=body.first_help_day,
        last_help_day=body.last_help_day,
        national_register_number=body.national_register_number,
        eid_document_number=body.eid_document_number,
        visits_per_month=body.visits_per_month,
        club_name=body.club_name,
        notes=body.notes,
        active=body.active,
    )
    person.set_roles(_normalise_roles(body.roles))

    db.add(person)
    await db.commit()
    await db.refresh(person)
    return person_to_dict(person)


@router.get("", response_model=list[PersonOut])
async def list_people(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    role: str | None = Query(default=None, description="Filter by role (case-insensitive)"),
    active: bool | None = Query(default=None),
) -> list[dict]:
    result = await db.execute(select(Person).order_by(Person.created_at.desc()))
    rows = result.scalars().all()

    q_norm = q.strip().lower() if q else None
    role_norm = role.strip().lower() if role else None

    filtered: list[Person] = []
    for p in rows:
        roles = p.get_roles()
        if active is not None and p.active != active:
            continue
        if role_norm and role_norm not in roles:
            continue
        if q_norm:
            haystack = " ".join(
                [
                    p.name,
                    p.email,
                    p.phone,
                    p.address,
                    p.national_register_number,
                    p.eid_document_number,
                    p.club_name,
                    p.notes,
                    " ".join(roles),
                ]
            ).lower()
            if q_norm not in haystack:
                continue
        filtered.append(p)

    return [person_to_dict(p) for p in filtered]


@router.get("/{person_id}", response_model=PersonOut)
async def get_person(person_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    person = await _get_or_404(db, person_id)
    return person_to_dict(person)


@router.put("/{person_id}", response_model=PersonOut)
async def update_person(
    person_id: str,
    body: PersonUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    person = await _get_or_404(db, person_id)

    first_help_day = body.first_help_day if "first_help_day" in body.model_fields_set else person.first_help_day
    last_help_day = body.last_help_day if "last_help_day" in body.model_fields_set else person.last_help_day
    _validate_help_days(first_help_day, last_help_day)

    for field in (
        "name",
        "phone",
        "address",
        "first_help_day",
        "last_help_day",
        "national_register_number",
        "eid_document_number",
        "visits_per_month",
        "club_name",
        "notes",
        "active",
    ):
        if field in body.model_fields_set:
            setattr(person, field, getattr(body, field))

    if "email" in body.model_fields_set:
        person.email = str(body.email).lower().strip() if body.email else ""

    if body.roles is not None:
        person.set_roles(_normalise_roles(body.roles))

    await db.commit()
    await db.refresh(person)
    return person_to_dict(person)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(person_id: str, db: AsyncSession = Depends(get_db)) -> None:
    person = await _get_or_404(db, person_id)
    await db.delete(person)
    await db.commit()


async def _get_or_404(db: AsyncSession, person_id: str) -> Person:
    result = await db.execute(select(Person).where(Person.id == person_id))
    person = result.scalar_one_or_none()
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found.")
    return person
