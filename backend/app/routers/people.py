"""People CRUD endpoints (admin-only)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Person, Reservation
from app.schemas import PersonCreate, PersonOut, PersonUpdate
from app.utils import make_id, person_to_dict, reservation_to_list_dict, roles_contains

router = APIRouter(
    prefix="/api/people",
    tags=["people"],
    dependencies=[Depends(require_admin)],
)


def _normalise_roles(roles: list[str]) -> list[str]:
    normalised: set[str] = set()
    for role in roles:
        if not role or not role.strip():
            continue
        r = role.strip().lower()
        normalised.add(r)
    return sorted(normalised)


def _validate_help_days(first_help_day, last_help_day) -> None:
    if first_help_day is not None and last_help_day is not None and first_help_day > last_help_day:
        raise HTTPException(
            status_code=400,
            detail="first_help_day must be before or equal to last_help_day.",
        )


def _normalise_optional_identity(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _raise_identity_conflict() -> None:
    raise HTTPException(
        status_code=409,
        detail=(
            "Person with this national register number or eID document number already exists."
        ),
    )


async def _ensure_unique_identity_fields(
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
            _raise_identity_conflict()

    if eid_document_number is not None:
        stmt = select(Person).where(Person.eid_document_number == eid_document_number)
        if exclude_id:
            stmt = stmt.where(Person.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            _raise_identity_conflict()


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(body: PersonCreate, db: AsyncSession = Depends(get_db)) -> dict:
    _validate_help_days(body.first_help_day, body.last_help_day)

    national_register_number = _normalise_optional_identity(body.national_register_number)
    eid_document_number = _normalise_optional_identity(body.eid_document_number)
    await _ensure_unique_identity_fields(
        db,
        national_register_number=national_register_number,
        eid_document_number=eid_document_number,
    )

    person = Person(
        id=make_id("per"),
        person_key=make_id("pkey"),
        name=body.name,
        email=str(body.email).lower().strip() if body.email else "",
        phone=body.phone,
        address=body.address,
        first_help_day=body.first_help_day,
        last_help_day=body.last_help_day,
        national_register_number=national_register_number,
        eid_document_number=eid_document_number,
        visits_per_month=body.visits_per_month,
        club_name=body.club_name,
        notes=body.notes,
        active=body.active,
    )
    person.set_roles(_normalise_roles(body.roles))

    db.add(person)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        _raise_identity_conflict()
    await db.refresh(person)
    return person_to_dict(person)


@router.get("", response_model=list[PersonOut])
async def list_people(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    role: str | None = Query(default=None, description="Filter by role (case-insensitive)"),
    active: bool | None = Query(default=None),
) -> list[dict]:
    stmt = select(Person)

    if active is not None:
        stmt = stmt.where(Person.active == active)

    if role:
        stmt = stmt.where(roles_contains(role))

    if q:
        q_escaped = q.strip().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        q_like = f"%{q_escaped}%"
        stmt = stmt.where(
            or_(
                Person.name.ilike(q_like, escape="\\"),
                Person.email.ilike(q_like, escape="\\"),
                Person.phone.ilike(q_like, escape="\\"),
                Person.address.ilike(q_like, escape="\\"),
                Person.national_register_number.ilike(q_like, escape="\\"),
                Person.eid_document_number.ilike(q_like, escape="\\"),
                Person.club_name.ilike(q_like, escape="\\"),
                Person.notes.ilike(q_like, escape="\\"),
                Person.roles.ilike(q_like, escape="\\"),
            )
        )

    result = await db.execute(stmt.order_by(Person.created_at.desc()))
    rows = result.scalars().all()
    return [person_to_dict(p) for p in rows]


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
        await _ensure_unique_identity_fields(
            db,
            national_register_number=nrr,
            exclude_id=person.id,
        )
    if eid_in_set and eid is not None:
        await _ensure_unique_identity_fields(
            db,
            eid_document_number=eid,
            exclude_id=person.id,
        )

    if nrr_in_set:
        person.national_register_number = nrr
    if eid_in_set:
        person.eid_document_number = eid

    if body.roles is not None:
        person.set_roles(_normalise_roles(body.roles))

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        _raise_identity_conflict()
    await db.refresh(person)
    return person_to_dict(person)


@router.get("/{person_id}/reservations")
async def list_person_reservations(
    person_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    person = await _get_or_404(db, person_id)

    stmt = select(Reservation).where(Reservation.person_id == person.id)
    if person.email:
        stmt = select(Reservation).where(
            or_(
                Reservation.person_id == person.id,
                Reservation.email == person.email,
            )
        )

    result = await db.execute(stmt.order_by(Reservation.created_at.desc()))
    return [reservation_to_list_dict(r) for r in result.scalars().all()]


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
