"""Member CRUD endpoints (admin-only).

Members are stored in the people table as a subset with role='member'.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Person
from app.schemas import PersonCreate, PersonOut, PersonUpdate
from app.utils import make_id, person_to_dict

router = APIRouter(
    prefix="/api/members",
    tags=["members"],
    dependencies=[Depends(require_admin)],
)


def _normalise_roles(roles: list[str]) -> list[str]:
    return sorted({r.strip().lower() for r in roles if r and r.strip()})


def _ensure_member_role(person: Person) -> None:
    roles = set(person.get_roles())
    roles.add("member")
    person.set_roles(sorted(roles))


def _has_member_role(person: Person) -> bool:
    return "member" in set(person.get_roles())


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_member(
    body: PersonCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
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
    _ensure_member_role(person)

    db.add(person)
    await db.commit()
    await db.refresh(person)
    return person_to_dict(person)


@router.get("", response_model=list[PersonOut])
async def list_members(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    active: bool | None = Query(default=None),
) -> list[dict]:
    result = await db.execute(select(Person).order_by(Person.created_at.desc()))
    rows = [p for p in result.scalars().all() if _has_member_role(p)]

    if active is not None:
        rows = [p for p in rows if p.active == active]

    if q:
        q_norm = q.strip().lower()
        rows = [
            p
            for p in rows
            if q_norm
            in " ".join(
                [
                    p.name,
                    p.email,
                    p.phone,
                    p.address,
                    p.club_name,
                    p.notes,
                ]
            ).lower()
        ]

    return [person_to_dict(p) for p in rows]


@router.get("/{person_id}", response_model=PersonOut)
async def get_member(person_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    person = await _get_or_404(db, person_id)
    return person_to_dict(person)


@router.put("/{person_id}", response_model=PersonOut)
async def update_member(
    person_id: str,
    body: PersonUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    person = await _get_or_404(db, person_id)

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
    _ensure_member_role(person)

    await db.commit()
    await db.refresh(person)
    return person_to_dict(person)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(person_id: str, db: AsyncSession = Depends(get_db)) -> None:
    person = await _get_or_404(db, person_id)
    await db.delete(person)
    await db.commit()


async def _get_or_404(db: AsyncSession, person_id: str) -> Person:
    result = await db.execute(select(Person).where(Person.id == person_id))
    person = result.scalar_one_or_none()
    if person is None or not _has_member_role(person):
        raise HTTPException(status_code=404, detail="Member not found.")
    return person
