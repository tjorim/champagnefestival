"""Shared application-service operations for people.

Used by both ``app.routers.people`` (REST) and ``app.mcp.admin.people`` (MCP).
Members and volunteers are also ``Person`` rows (see
``app.services.members_service`` / ``app.services.volunteers_service``) but
each has its own rules layered on top, so they get their own service module
too rather than being folded into this one. ``parse_phone``/``normalise_roles``/
``normalise_optional_identity`` are all reused from here — identity
normalisation, role normalisation, and phone parsing are identical across all
three now. This wasn't always true: members/volunteers used to only strip
surrounding whitespace instead of this module's fuller separator-stripping +
lowercasing, a pre-existing inconsistency across the three domains' unique
national-register/eID checks that predated #860's module split.
Unifying it required renormalising already-stored rows so the unique
constraint stayed valid under the stricter rule; that repair is preserved in
the database baseline.
``delete_person``'s cascade is reused by ``members_service.delete_member`` via
its ``action`` parameter.

Raises ``HTTPException`` directly (matching the pre-existing shared helpers
this consolidates, same convention as ``app/services/editions_service.py``)
rather than the ``ServiceError`` hierarchy in ``app/services/errors.py``.
Each adapter fetches the row with its own idiomatic 404 helper (``get_or_404``
for REST, ``get_or_error`` for MCP) and passes it in for update/delete/merge.
"""

from __future__ import annotations

import logging
from typing import NoReturn

import phonenumbers
from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.live import live_bus
from app.live import mapping as live_mapping
from app.models import Exhibitor, Person, Registration, VolunteerPeriod
from app.schemas import PersonCreate, PersonUpdate
from app.utils import get_or_404, make_id, person_to_dict

logger = logging.getLogger(__name__)


def normalise_roles(roles: list[str]) -> list[str]:
    normalised: set[str] = set()
    for role in roles:
        if not role or not role.strip():
            continue
        r = role.strip().lower()
        normalised.add(r)
    return sorted(normalised)


def normalise_optional_identity(value: str | None) -> str | None:
    """Strip separators and normalise case so that e.g. '93.05.18-223.61' and
    '93051822361' are treated as the same value for uniqueness checks."""
    if value is None:
        return None
    for ch in (" ", ".", "-", "/"):
        value = value.replace(ch, "")
    value = value.strip().lower()
    return value or None


def parse_phone(raw: str | None) -> str:
    """Parse and normalise a phone number to E.164 format.

    Uses the ``phonenumbers`` library (Google libphonenumber binding) with
    ``"BE"`` as the default region for numbers that lack a country code prefix.
    Numbers that already carry a ``+`` or ``00`` IDD prefix are parsed
    regardless of the default region.

    Returns ``""`` for empty/None input.
    Raises :class:`fastapi.HTTPException` (422) for unparseable or invalid input.
    """
    if not raw or not raw.strip():
        return ""
    try:
        parsed = phonenumbers.parse(raw, "BE")
    except phonenumbers.NumberParseException as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid phone number: {exc}",
        ) from exc
    if not phonenumbers.is_valid_number(parsed):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid phone number.",
        )
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def raise_identity_conflict() -> NoReturn:
    raise HTTPException(
        status_code=409,
        detail="Person with this national register number or eID document number already exists.",
    )


async def ensure_unique_identity_fields(
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
            raise_identity_conflict()

    if eid_document_number is not None:
        stmt = select(Person).where(Person.eid_document_number == eid_document_number)
        if exclude_id:
            stmt = stmt.where(Person.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise_identity_conflict()


async def get_person_or_404(db: AsyncSession, person_id: str) -> Person:
    return await get_or_404(db, Person, person_id, "Person not found.")


async def create_person(db: AsyncSession, *, body: PersonCreate, actor: str, request_id: str | None = None) -> dict:
    national_register_number = normalise_optional_identity(body.national_register_number)
    eid_document_number = normalise_optional_identity(body.eid_document_number)
    await ensure_unique_identity_fields(
        db,
        national_register_number=national_register_number,
        eid_document_number=eid_document_number,
    )

    person = Person(
        id=make_id("per"),
        name=body.name,
        email=str(body.email).lower().strip() if body.email else "",
        phone=parse_phone(body.phone),
        address=body.address,
        national_register_number=national_register_number,
        eid_document_number=eid_document_number,
        visits_per_month=body.visits_per_month,
        club_name=body.club_name,
        notes=body.notes,
        active=body.active,
    )
    person.roles = normalise_roles(body.roles)

    db.add(person)
    await write_audit_entry(
        db,
        actor=actor,
        action="person_created",
        resource_type="person",
        resource_id=person.id,
        request_id=request_id,
        details={"roles": person.roles},
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise_identity_conflict()
    await db.refresh(person)
    return person_to_dict(person)


async def apply_person_update(
    db: AsyncSession, person: Person, body: PersonUpdate, *, actor: str, request_id: str | None = None
) -> dict:
    for field in ("name", "address", "visits_per_month", "club_name", "notes", "active"):
        if field in body.model_fields_set:
            setattr(person, field, getattr(body, field))

    if "phone" in body.model_fields_set:
        person.phone = parse_phone(body.phone)

    if "email" in body.model_fields_set:
        person.email = str(body.email).lower().strip() if body.email else ""

    nrr_in_set = "national_register_number" in body.model_fields_set
    eid_in_set = "eid_document_number" in body.model_fields_set
    nrr = normalise_optional_identity(body.national_register_number) if nrr_in_set else None
    eid = normalise_optional_identity(body.eid_document_number) if eid_in_set else None

    if nrr_in_set and nrr is not None:
        await ensure_unique_identity_fields(db, national_register_number=nrr, exclude_id=person.id)
    if eid_in_set and eid is not None:
        await ensure_unique_identity_fields(db, eid_document_number=eid, exclude_id=person.id)

    if nrr_in_set:
        person.national_register_number = nrr
    if eid_in_set:
        person.eid_document_number = eid

    if body.roles is not None:
        person.roles = normalise_roles(body.roles)

    await write_audit_entry(
        db,
        actor=actor,
        action="person_updated",
        resource_type="person",
        resource_id=person.id,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise_identity_conflict()
    await db.refresh(person)
    return person_to_dict(person)


async def delete_person(
    db: AsyncSession, person: Person, *, actor: str, request_id: str | None = None, action: str = "person_deleted"
) -> dict:
    """Delete a person and cascade-delete their registrations.

    ``action`` lets ``app.services.members_service.delete_member`` reuse this
    routine verbatim with its own audit action name (``"member_deleted"``)
    instead of keeping a byte-for-byte duplicate.
    """
    person_id = person.id
    result = await db.execute(
        select(Registration).options(selectinload(Registration.event)).where(Registration.person_id == person_id)
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
        action=action,
        resource_type="person",
        resource_id=person_id,
        request_id=request_id,
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
    return {"deleted": True, "id": person_id}


async def merge_people(
    db: AsyncSession, canonical: Person, duplicate: Person, *, actor: str, request_id: str | None = None
) -> dict:
    """Merge ``duplicate`` into ``canonical``.

    - All reservations and exhibitor contacts linked to the duplicate are
      re-pointed to the canonical person.
    - Blank string fields on the canonical person are filled from the duplicate.
    - Roles are merged (union).
    - Unique identity fields (national_register_number, eid_document_number)
      are adopted from the duplicate only if the canonical person lacks them;
      if both carry conflicting values a 409 is raised.
    - The duplicate person record is deleted.
    """
    duplicate_id = duplicate.id

    # Guard unique identity fields before making any changes.
    # Normalise values with the same routine used by create/update so that
    # equivalent but differently-formatted IDs are not treated as conflicts.
    field_labels = {
        "national_register_number": "national register number",
        "eid_document_number": "eID document number",
    }
    for field in ("national_register_number", "eid_document_number"):
        canon_val = normalise_optional_identity(getattr(canonical, field))
        dup_val = normalise_optional_identity(getattr(duplicate, field))
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
        normalised = normalise_optional_identity(existing)
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
    adopted = {
        field: normalise_optional_identity(getattr(duplicate, field))
        for field in ("national_register_number", "eid_document_number")
        if not getattr(canonical, field) and getattr(duplicate, field)
    }
    if adopted:
        # These columns are UNIQUE, so the duplicate has to release its value
        # before the canonical can take it. A single flush does not guarantee
        # that order — SQLAlchemy batches same-mapper UPDATEs by primary key, so
        # whenever the canonical's id sorts first it would write the value while
        # the duplicate still holds it. Clear and flush separately.
        for field in adopted:
            setattr(duplicate, field, None)
        await db.flush()
        for field, value in adopted.items():
            setattr(canonical, field, value)

    await db.flush()

    # Re-point everything that references the duplicate. VolunteerPeriod matters
    # most: its FK cascades on delete, so a period left pointing at the duplicate
    # is destroyed below rather than transferred, leaving a person carrying the
    # volunteer role with no help periods.
    await db.execute(update(Registration).where(Registration.person_id == duplicate_id).values(person_id=canonical.id))
    await db.execute(
        update(Exhibitor).where(Exhibitor.contact_person_id == duplicate_id).values(contact_person_id=canonical.id)
    )
    await db.execute(
        update(VolunteerPeriod).where(VolunteerPeriod.volunteer_id == duplicate_id).values(volunteer_id=canonical.id)
    )

    await db.delete(duplicate)
    await write_audit_entry(
        db,
        actor=actor,
        action="person_merged",
        resource_type="person",
        resource_id=canonical.id,
        request_id=request_id,
        details={"duplicate_id": duplicate_id},
    )
    await db.commit()
    await db.refresh(canonical)
    return person_to_dict(canonical)
