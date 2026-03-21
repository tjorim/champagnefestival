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


def _normalise_optional_identity(value: str | None) -> str | None:
    """Strip separators and normalise case so that e.g. '93.05.18-223.61' and
    '93051822361' are treated as the same value for uniqueness checks."""
    if value is None:
        return None
    for ch in (" ", ".", "-", "/"):
        value = value.replace(ch, "")
    value = value.strip().lower()
    return value or None


DEFAULT_COUNTRY_PREFIX = "32"  # Belgium; used when a local number starts with "0"


def normalize_phone(phone: str | None, default_country_prefix: str = DEFAULT_COUNTRY_PREFIX) -> str:
    """Produce an E.164-like canonical form so that equivalent numbers such as
    '+32 470 12 34 56', '0032 470 12 34 56' and '0470 12 34 56' all normalise to
    '+32470123456'.

    Rules applied in order:
    1. Return '' for falsy input.
    2. Strip all characters except digits and a leading '+'.
    3. Convert a leading '00' in the digit string to '+'.
    4. If the digit string starts with a single leading '0', replace it with
       '+{default_country_prefix}'.
    5. Prepend '+' if the result contains only digits (no international prefix).
    """
    if not phone:
        return ""
    # Detect an explicit leading '+' before stripping.
    has_plus = phone.lstrip().startswith("+")
    digits = "".join(c for c in phone if c.isdigit())
    if not digits:
        return ""
    if has_plus:
        # Already had a '+'; keep the digit string as-is (international form).
        return "+" + digits
    if digits.startswith("00"):
        # Leading '00' is the international dialling prefix — convert to '+'.
        return "+" + digits[2:]
    if digits.startswith("0"):
        # Local number with trunk prefix '0' — replace with country prefix.
        return "+" + default_country_prefix + digits[1:]
    # Bare digits with no prefix — assume already an international number body.
    return "+" + digits


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
        phone=normalize_phone(body.phone),
        address=body.address,
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

    for field in (
        "name",
        "address",
        "visits_per_month",
        "club_name",
        "notes",
        "active",
    ):
        if field in body.model_fields_set:
            setattr(person, field, getattr(body, field))

    if "phone" in body.model_fields_set:
        person.phone = normalize_phone(body.phone)

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
    # Normalise values with the same routine used by create/update so that
    # equivalent but differently-formatted IDs are not treated as conflicts.
    field_labels = {
        "national_register_number": "national register number",
        "eid_document_number": "eID document number",
    }
    for field in ("national_register_number", "eid_document_number"):
        canon_val = _normalise_optional_identity(getattr(canonical, field))
        dup_val = _normalise_optional_identity(getattr(duplicate, field))
        if canon_val and dup_val and canon_val != dup_val:
            label = field_labels[field]
            raise HTTPException(
                status_code=409,
                detail=f"Both persons have a different {label}; resolve manually before merging.",
            )

    # Normalise canonical's own existing identity fields in-place so the
    # surviving record is always in canonical form, consistent with
    # create/update_person.
    for field in ("national_register_number", "eid_document_number"):
        existing = getattr(canonical, field)
        normalised = _normalise_optional_identity(existing)
        if normalised != existing:
            setattr(canonical, field, normalised or None)

    # Fill blank string fields on canonical from duplicate.
    for field in ("email", "phone", "address", "club_name", "notes"):
        if not getattr(canonical, field) and getattr(duplicate, field):
            setattr(canonical, field, getattr(duplicate, field))

    # Fill blank nullable fields on canonical from duplicate.
    for field in ("visits_per_month",):
        if getattr(canonical, field) is None and getattr(duplicate, field) is not None:
            setattr(canonical, field, getattr(duplicate, field))

    # Merge roles (union).
    canonical.roles = sorted(set(canonical.roles) | set(duplicate.roles))

    # Adopt unique identity fields from duplicate if canonical lacks them.
    # Normalise the value from the duplicate before storing so the canonical
    # ends up with the same canonical form used by create/update_person.
    # Clear from duplicate first to avoid unique constraint violation on delete.
    for field in ("national_register_number", "eid_document_number"):
        if not getattr(canonical, field) and getattr(duplicate, field):
            setattr(canonical, field, _normalise_optional_identity(getattr(duplicate, field)))
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
