"""People CRUD endpoints (admin-only)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Text, cast, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Exhibitor, Person, Reservation
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
    """Strip separators and normalise case so that e.g. '93.05.18-223.61' and
    '93051822361' are treated as the same value for uniqueness checks."""
    if value is None:
        return None
    for ch in (" ", ".", "-", "/"):
        value = value.replace(ch, "")
    value = value.strip().lower()
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
    person.roles = _normalise_roles(body.roles)

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
                cast(Person.roles, Text).ilike(q_like, escape="\\"),
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
        person.roles = _normalise_roles(body.roles)

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

    result = await db.execute(
        select(Reservation)
        .where(Reservation.person_id == person.id)
        .order_by(Reservation.created_at.desc())
    )
    rows = result.scalars().all()
    for r in rows:
        r._person = person
    return [reservation_to_list_dict(r) for r in rows]


@router.post("/{person_id}/merge/{duplicate_id}", response_model=PersonOut)
async def merge_people(
    person_id: str,
    duplicate_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Merge duplicate_id into person_id (admin-only).

    - All reservations and exhibitor contacts linked to the duplicate are
      re-pointed to the canonical person.
    - Blank string fields on the canonical person are filled from the duplicate.
    - Roles are merged (union).
    - Unique identity fields (national_register_number, eid_document_number)
      are adopted from the duplicate only if the canonical person lacks them;
      if both carry conflicting values a 409 is returned.
    - The duplicate person record is deleted.
    """
    if person_id == duplicate_id:
        raise HTTPException(status_code=400, detail="Cannot merge a person with themselves.")

    canonical = await _get_or_404(db, person_id)
    duplicate = await _get_or_404(db, duplicate_id)

    # Guard unique identity fields before making any changes.
    for field in ("national_register_number", "eid_document_number"):
        canon_val = getattr(canonical, field)
        dup_val = getattr(duplicate, field)
        if canon_val and dup_val and canon_val != dup_val:
            raise HTTPException(
                status_code=409,
                detail=f"Both persons have a different {field}; resolve manually before merging.",
            )

    # Fill blank string fields on canonical from duplicate.
    for field in ("email", "phone", "address", "club_name", "notes"):
        if not getattr(canonical, field) and getattr(duplicate, field):
            setattr(canonical, field, getattr(duplicate, field))

    # Fill blank nullable fields on canonical from duplicate.
    for field in ("visits_per_month", "first_help_day", "last_help_day"):
        if getattr(canonical, field) is None and getattr(duplicate, field) is not None:
            setattr(canonical, field, getattr(duplicate, field))

    # Merge roles (union).
    canonical.roles = sorted(set(canonical.roles) | set(duplicate.roles))

    # Adopt unique identity fields from duplicate if canonical lacks them.
    # Clear from duplicate first to avoid unique constraint violation on delete.
    for field in ("national_register_number", "eid_document_number"):
        if not getattr(canonical, field) and getattr(duplicate, field):
            setattr(canonical, field, getattr(duplicate, field))
            setattr(duplicate, field, None)

    await db.flush()

    # Re-point all reservations and exhibitor contacts.
    await db.execute(
        update(Reservation)
        .where(Reservation.person_id == duplicate_id)
        .values(person_id=person_id)
    )
    await db.execute(
        update(Exhibitor)
        .where(Exhibitor.contact_person_id == duplicate_id)
        .values(contact_person_id=person_id)
    )

    await db.delete(duplicate)
    await db.commit()
    await db.refresh(canonical)
    return person_to_dict(canonical)


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
