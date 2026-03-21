"""Member CRUD endpoints (admin-only).

Members are stored in the people table as a subset with role='member'.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Person
from app.schemas import PersonCreate, PersonOut, PersonUpdate
from app.utils import make_id, person_to_dict, roles_contains

router = APIRouter(
    prefix="/api/members",
    tags=["members"],
    dependencies=[Depends(require_admin)],
)


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
    db: AsyncSession = Depends(get_db),
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
    await db.commit()
    await db.refresh(person)
    return person_to_dict(person)


@router.get("", response_model=list[PersonOut])
async def list_members(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    active: bool | None = Query(default=None),
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

    result = await db.execute(stmt.order_by(Person.created_at.desc()))
    rows = result.scalars().all()
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
