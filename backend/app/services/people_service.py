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

from app.core.ids import make_id
from app.db.queries import get_or_404
from app.models import Organization, Person, Registration, StampCard, User, VolunteerPeriod
from app.schemas import PersonCreate, PersonOut, PersonUpdate
from app.services import email_consent_service
from app.services.audit_service import write_audit_entry
from app.services.errors import ApiHTTPException
from app.services.live import mapping as live_mapping
from app.services.live import notify_live_event
from app.services.member_email import (
    check_email_integrity,
    commit_member_changes,
    ensure_member_email,
    flush_member_changes,
)
from app.services.person_account import account_conflict, email_matches, normalise_email, unlink_person
from app.services.role_history import lock_role_people, merge_roles, normalise_roles, sync_roles
from app.services.serializers import person_to_out

logger = logging.getLogger(__name__)


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
        raise ApiHTTPException(
            code="person_invalid_phone",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid phone number: {exc}",
        ) from exc
    if not phonenumbers.is_valid_number(parsed):
        raise ApiHTTPException(
            code="person_invalid_phone",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid phone number.",
        )
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def raise_identity_conflict() -> NoReturn:
    raise ApiHTTPException(
        code="person_identity_conflict",
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
        with db.no_autoflush:
            existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise_identity_conflict()

    if eid_document_number is not None:
        stmt = select(Person).where(Person.eid_document_number == eid_document_number)
        if exclude_id:
            stmt = stmt.where(Person.id != exclude_id)
        with db.no_autoflush:
            existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise_identity_conflict()


async def get_person_or_404(db: AsyncSession, person_id: str) -> Person:
    return await get_or_404(db, Person, person_id, "Person not found.")


def reject_member_fields(body: PersonCreate | PersonUpdate) -> None:
    """``member_since`` belongs to the member endpoints; ignoring it here would hide a mistake."""
    if body.member_since is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="member_since can only be set through the member endpoints.",
        )

    if {"inactivity_exempt", "inactivity_exempt_note"} & body.model_fields_set:
        raise HTTPException(
            status_code=422, detail="Inactivity exemptions can only be set through the member endpoints."
        )


async def create_person(
    db: AsyncSession, *, body: PersonCreate, actor: str, request_id: str | None = None
) -> PersonOut:
    reject_member_fields(body)
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
        preferred_language=body.preferred_language,
        address=body.address,
        national_register_number=national_register_number,
        eid_document_number=eid_document_number,
        notes=body.notes,
    )
    sync_roles(person, normalise_roles(body.roles))

    db.add(person)
    await ensure_member_email(db, person)
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
    except IntegrityError as exc:
        await db.rollback()
        check_email_integrity(exc)
        raise_identity_conflict()
    await db.refresh(person)
    return person_to_out(person)


async def apply_person_update(
    db: AsyncSession, person: Person, body: PersonUpdate, *, actor: str, request_id: str | None = None
) -> PersonOut:
    reject_member_fields(body)
    roles = normalise_roles(body.roles) if body.roles is not None else None
    if roles is not None:
        await lock_role_people(db, person)
        releasing_member = "member" in person.roles and "member" not in roles
        sync_roles(person, roles)
        if releasing_member and "email" in body.model_fields_set:
            # Release the indexed address before changing the parent email.
            await flush_member_changes(db)

    for field in ("name", "address", "preferred_language", "notes"):
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

    with db.no_autoflush:
        if nrr_in_set and nrr is not None:
            await ensure_unique_identity_fields(db, national_register_number=nrr, exclude_id=person.id)
        if eid_in_set and eid is not None:
            await ensure_unique_identity_fields(db, eid_document_number=eid, exclude_id=person.id)

    if nrr_in_set:
        person.national_register_number = nrr
    if eid_in_set:
        person.eid_document_number = eid

    await ensure_member_email(db, person)
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
    except IntegrityError as exc:
        await db.rollback()
        check_email_integrity(exc)
        raise_identity_conflict()
    await db.refresh(person)
    return person_to_out(person)


def _name_key(name: str) -> str:
    return " ".join(name.casefold().split())


async def find_or_create_public_person(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    phone: str,
    preferred_language: str | None,
    user: User | None = None,
) -> tuple[Person, bool]:
    """The directory record a public booking belongs to, and whether it was just created (#1655).

    This is the one matching rule for visitor bookings. A booking reuses an existing person when its
    **email (trimmed, case-insensitive) and name (case-folded, whitespace collapsed)** both match a
    non-anonymised record. The phone number is *not* part of the key, so a retyped or reformatted
    number no longer creates a second person.

    * A record the signed-in *user* is linked to wins when it matches, then the oldest match
      (``created_at``, ``id``); an anonymised record is never reused.
    * Nothing about an existing person is overwritten from an unauthenticated form: the stored phone
      is kept, and only a blank phone is filled in. (The caller shows the visitor their own submitted
      number, never the stored one, so matching on email and name cannot be used to read a phone back.)
    * Otherwise a new person is created. Two different people sharing one inbox (a household) stay
      separate because their names differ.

    Does not commit; the new person is flushed so the caller can reference its id.
    """
    email_norm = normalise_email(email)
    name_key = _name_key(name)
    candidates = (
        await db.scalars(
            select(Person).where(email_matches(email_norm), ~Person.anonymised).order_by(Person.created_at, Person.id)
        )
    ).all()
    matches = [candidate for candidate in candidates if _name_key(candidate.name) == name_key]
    if user is not None:
        matches.sort(key=lambda candidate: candidate.user_id != user.id)
    if matches:
        person = matches[0]
        if not person.phone and phone:
            person.phone = phone
        return person, False
    person = Person(id=make_id("per"), name=name, email=email_norm, phone=phone, preferred_language=preferred_language)
    db.add(person)
    await db.flush()
    return person, True


async def anonymise_person(db: AsyncSession, person: Person, *, actor: str, request_id: str | None = None) -> PersonOut:
    """Blank a person's identity fields in place, keeping their registrations.

    See docs/decisions/934-data-retention-and-erasure.md for the retention
    schedule this implements. Refuses anyone who currently or ever held the
    volunteer role (identified by having a NISS/eID on file) — that
    population's retention is settled as indefinite, and stripping their
    identity would leave a NISS/eID that's useless for the insurance purpose
    it's kept for. Someone with an active email consent keeps their `email`;
    blanking it would silently end a still-active subscription the anonymisation
    window was never meant to touch. Consent history (category, dates, source) is
    always kept, and a pending confirmation is dropped.

    Deterministic and safe to call again on an already-anonymised person: the
    pseudonym is derived from the stable person ID, so a repeat produces the
    same row rather than a second, different rewrite.

    Does not touch ``registrations`` or ``roles`` — those are the
    operational/historical record this anonymisation is deliberately scoped to leave alone.
    """
    if person.national_register_number or person.eid_document_number:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This person has a national register number or eID on file and cannot be anonymised.",
        )

    person.name = f"Guest #{person.id[-6:]}"
    if not await email_consent_service.has_open_consent(db, person.id):
        person.email = ""
    await email_consent_service.drop_pending_confirmations(db, person.id)
    person.phone = ""
    person.address = ""
    person.notes = ""
    person.anonymised = True
    # An erased record must not stay reachable from an account: the account keeps its bookings but no longer
    # answers for this person (#1655).
    await unlink_person(db, person, method="anonymised", actor=actor, request_id=request_id)

    await write_audit_entry(
        db,
        actor=actor,
        action="person_anonymised",
        resource_type="person",
        resource_id=person.id,
        request_id=request_id,
    )
    await db.commit()
    await db.refresh(person)
    return person_to_out(person)


async def delete_person(db: AsyncSession, person: Person, *, actor: str, request_id: str | None = None) -> dict:
    """Delete a person and cascade-delete their registrations (erasure, not a role change)."""
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
    from app.services.errors import ApiHTTPException

    if await db.scalar(select(StampCard.id).where(StampCard.person_id == person_id).limit(1)):
        raise ApiHTTPException(409, "person_has_stamp_cards", "Anonymise this person to retain stamp card history.")
    for registration in registrations:
        await db.delete(registration)
    await db.delete(person)
    await write_audit_entry(
        db,
        actor=actor,
        action="person_deleted",
        resource_type="person",
        resource_id=person_id,
        request_id=request_id,
        details={"deleted_registration_count": len(registrations)},
    )
    for scope in registration_scopes:
        await notify_live_event(db, live_mapping.registration_changed(action="deleted", **scope))
    await db.commit()
    return {"deleted": True, "id": person_id}


async def merge_people(
    db: AsyncSession, canonical: Person, duplicate: Person, *, actor: str, request_id: str | None = None
) -> PersonOut:
    """Merge ``duplicate`` into ``canonical``.

    - All reservations and organization contacts linked to the duplicate are
      re-pointed to the canonical person.
    - Blank string fields on the canonical person are filled from the duplicate.
    - Email consent history moves to the canonical person — merging away a
      duplicate must never silently discard a consent record. A category the
      canonical person already has open keeps their record, and consent given
      for a different address is kept as closed history rather than carried over.
    - Roles are merged (union).
    - Unique identity fields (national_register_number, eid_document_number)
      are adopted from the duplicate only if the canonical person lacks them;
      if both carry conflicting values a 409 is raised.
    - The duplicate person record is deleted.
    """
    await lock_role_people(db, canonical, duplicate)
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

    # Two different accounts each own one of these records: merging would silently strip one account of
    # its person, so it is a conflict to resolve by hand (unlink one side first), not something to guess.
    if duplicate.user_id is not None and canonical.user_id not in (None, duplicate.user_id):
        raise account_conflict("Both people are linked to different accounts; unlink one of them before merging.")

    # Normalise canonical's own existing identity fields in-place so the
    # surviving record is always in canonical form, consistent with
    # create/update_person.
    for field in ("national_register_number", "eid_document_number"):
        existing = getattr(canonical, field)
        normalised = normalise_optional_identity(existing)
        if normalised != existing:
            setattr(canonical, field, normalised or None)

    # Fill blank string fields on canonical from duplicate.
    for field in ("email", "phone", "address", "notes"):
        if not getattr(canonical, field) and getattr(duplicate, field):
            setattr(canonical, field, getattr(duplicate, field))

    # Consent was given for the duplicate's address: it only carries over to the same address.
    same_address = email_consent_service.normalise_email(canonical.email) == email_consent_service.normalise_email(
        duplicate.email
    )

    # Keep an exemption attached to the person when an exempt duplicate is merged.
    if duplicate.inactivity_exempt and not canonical.inactivity_exempt:
        canonical.inactivity_exempt = True
        canonical.inactivity_exempt_note = duplicate.inactivity_exempt_note

    merge_roles(canonical, duplicate)

    await ensure_member_email(db, canonical, exclude_ids=(duplicate.id,))
    # Release the duplicate email before an adopted active membership is flushed.
    with db.no_autoflush:
        await db.execute(update(Person).where(Person.id == duplicate.id).values(email=""))

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
        await flush_member_changes(db)
        for field, value in adopted.items():
            setattr(canonical, field, value)

    # The duplicate's account link follows the surviving record. The column is UNIQUE, so the duplicate
    # releases it (and the release is flushed) before the canonical takes it.
    moved_user = duplicate.user if duplicate.user_id is not None and canonical.user_id is None else None
    if moved_user is not None:
        duplicate.user_id = None
        duplicate.user = None
        await flush_member_changes(db)
        canonical.user_id = moved_user.id
        canonical.user = moved_user

    await flush_member_changes(db)

    # Re-point everything that references the duplicate. VolunteerPeriod matters
    # most: its FK cascades on delete, so a period left pointing at the duplicate
    # is destroyed below rather than transferred, leaving a person carrying the
    # volunteer role with no help periods.
    await email_consent_service.merge_consents(db, canonical.id, duplicate_id, same_address=same_address)
    await db.execute(update(StampCard).where(StampCard.person_id == duplicate_id).values(person_id=canonical.id))
    await db.execute(update(Registration).where(Registration.person_id == duplicate_id).values(person_id=canonical.id))
    await db.execute(
        update(Organization)
        .where(Organization.contact_person_id == duplicate_id)
        .values(contact_person_id=canonical.id)
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
        details={"duplicate_id": duplicate_id, "account_link_moved": moved_user is not None},
    )
    await commit_member_changes(db)
    await db.refresh(canonical)
    return person_to_out(canonical)
