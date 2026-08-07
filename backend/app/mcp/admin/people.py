"""Admin (write) MCP tool implementations for people management.

Mirrors ``app.routers.people``. Members and volunteers are also ``Person``
rows (see ``app.mcp.admin.members`` / ``app.mcp.admin.volunteers``) but each
has its own REST router with its own rules, so they get their own MCP module
too rather than being folded into this one.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.live import live_bus
from app.live import mapping as live_mapping
from app.mcp.utils import as_value_error, get_or_error, validate_with_schema
from app.models import Exhibitor, Person, Registration, VolunteerPeriod
from app.routers.people import (
    _ensure_unique_identity_fields,
    _normalise_optional_identity,
    _normalise_roles,
    _raise_identity_conflict,
    parse_phone,
)
from app.schemas import PersonCreate, PersonUpdate
from app.utils import make_id, person_to_dict

logger = logging.getLogger(__name__)


async def create_person(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    email: str | None = None,
    phone: str = "",
    address: str = "",
    roles: list[str] | None = None,
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    visits_per_month: int | None = None,
    club_name: str = "",
    notes: str = "",
    active: bool = True,
) -> dict:
    body = validate_with_schema(
        PersonCreate,
        name=name,
        email=email,
        phone=phone,
        address=address,
        roles=roles or [],
        national_register_number=national_register_number,
        eid_document_number=eid_document_number,
        visits_per_month=visits_per_month,
        club_name=club_name,
        notes=notes,
        active=active,
    )
    national_register_number = _normalise_optional_identity(body.national_register_number)
    eid_document_number = _normalise_optional_identity(body.eid_document_number)

    async with session_factory() as db:
        try:
            await _ensure_unique_identity_fields(
                db,
                national_register_number=national_register_number,
                eid_document_number=eid_document_number,
            )
            phone_value = parse_phone(body.phone)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        person = Person(
            id=make_id("per"),
            name=body.name,
            email=str(body.email).lower().strip() if body.email else "",
            phone=phone_value,
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
        await write_audit_entry(
            db,
            actor=actor,
            action="person_created",
            resource_type="person",
            resource_id=person.id,
            details={"roles": person.roles},
        )
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            try:
                _raise_identity_conflict()
            except HTTPException as exc:
                raise as_value_error(exc) from exc
        await db.refresh(person)
        return person_to_dict(person)


async def get_person(session_factory: Any, person_id: str) -> dict:
    async with session_factory() as db:
        person = await get_or_error(db, Person, person_id, f"Person '{person_id}' not found.")
        return person_to_dict(person)


async def update_person(
    session_factory: Any,
    actor: str,
    person_id: str,
    *,
    name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    address: str | None = None,
    roles: list[str] | None = None,
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    visits_per_month: int | None = None,
    club_name: str | None = None,
    notes: str | None = None,
    active: bool | None = None,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "name": name,
            "email": email,
            "phone": phone,
            "address": address,
            "roles": roles,
            "national_register_number": national_register_number,
            "eid_document_number": eid_document_number,
            "visits_per_month": visits_per_month,
            "club_name": club_name,
            "notes": notes,
            "active": active,
        }.items()
        if v is not None
    }
    body = validate_with_schema(PersonUpdate, **provided)

    async with session_factory() as db:
        person = await get_or_error(db, Person, person_id, f"Person '{person_id}' not found.")

        for field in ("name", "address", "visits_per_month", "club_name", "notes", "active"):
            if field in body.model_fields_set:
                setattr(person, field, getattr(body, field))

        if "phone" in body.model_fields_set:
            try:
                person.phone = parse_phone(body.phone)
            except HTTPException as exc:
                raise as_value_error(exc) from exc

        if "email" in body.model_fields_set:
            person.email = str(body.email).lower().strip() if body.email else ""

        nrr_in_set = "national_register_number" in body.model_fields_set
        eid_in_set = "eid_document_number" in body.model_fields_set
        nrr = _normalise_optional_identity(body.national_register_number) if nrr_in_set else None
        eid = _normalise_optional_identity(body.eid_document_number) if eid_in_set else None

        try:
            if nrr_in_set and nrr is not None:
                await _ensure_unique_identity_fields(db, national_register_number=nrr, exclude_id=person.id)
            if eid_in_set and eid is not None:
                await _ensure_unique_identity_fields(db, eid_document_number=eid, exclude_id=person.id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        if nrr_in_set:
            person.national_register_number = nrr
        if eid_in_set:
            person.eid_document_number = eid

        if body.roles is not None:
            person.roles = _normalise_roles(body.roles)

        await write_audit_entry(
            db,
            actor=actor,
            action="person_updated",
            resource_type="person",
            resource_id=person.id,
            details={"fields_changed": sorted(body.model_fields_set)},
        )
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            try:
                _raise_identity_conflict()
            except HTTPException as exc:
                raise as_value_error(exc) from exc
        await db.refresh(person)
        return person_to_dict(person)


async def delete_person(session_factory: Any, actor: str, person_id: str) -> dict:
    async with session_factory() as db:
        person = await get_or_error(db, Person, person_id, f"Person '{person_id}' not found.")
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
            action="person_deleted",
            resource_type="person",
            resource_id=person_id,
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


async def merge_people(session_factory: Any, actor: str, person_id: str, duplicate_id: str) -> dict:
    """Merge duplicate_id into person_id.

    See ``app.routers.people.merge_people`` for the exact semantics this
    mirrors: reservations/exhibitor contacts/volunteer periods linked to the
    duplicate are re-pointed to the canonical person, blank fields on the
    canonical are filled from the duplicate, roles are unioned, and unique
    identity fields are adopted from the duplicate only if the canonical
    lacks them (a conflict on both being set to different values is an
    error). The duplicate person record is deleted.
    """
    if person_id == duplicate_id:
        raise ValueError("Cannot merge a person with themselves.")

    async with session_factory() as db:
        canonical = await get_or_error(db, Person, person_id, f"Person '{person_id}' not found.")
        duplicate = await get_or_error(db, Person, duplicate_id, f"Person '{duplicate_id}' not found.")

        field_labels = {
            "national_register_number": "national register number",
            "eid_document_number": "eID document number",
        }
        for field in ("national_register_number", "eid_document_number"):
            canon_val = _normalise_optional_identity(getattr(canonical, field))
            dup_val = _normalise_optional_identity(getattr(duplicate, field))
            if canon_val and dup_val and canon_val != dup_val:
                label = field_labels[field]
                raise ValueError(f"Both persons have a different {label}; resolve manually before merging.")

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
        adopted = {
            field: _normalise_optional_identity(getattr(duplicate, field))
            for field in ("national_register_number", "eid_document_number")
            if not getattr(canonical, field) and getattr(duplicate, field)
        }
        if adopted:
            # These columns are UNIQUE, so the duplicate has to release its
            # value before the canonical can take it. Clear and flush
            # separately so the two writes cannot race for the same value.
            for field in adopted:
                setattr(duplicate, field, None)
            await db.flush()
            for field, value in adopted.items():
                setattr(canonical, field, value)

        await db.flush()

        # Re-point everything that references the duplicate.
        await db.execute(
            update(Registration).where(Registration.person_id == duplicate_id).values(person_id=person_id)
        )
        await db.execute(
            update(Exhibitor).where(Exhibitor.contact_person_id == duplicate_id).values(contact_person_id=person_id)
        )
        await db.execute(
            update(VolunteerPeriod)
            .where(VolunteerPeriod.volunteer_id == duplicate_id)
            .values(volunteer_id=person_id)
        )

        await db.delete(duplicate)
        await write_audit_entry(
            db,
            actor=actor,
            action="person_merged",
            resource_type="person",
            resource_id=canonical.id,
            details={"duplicate_id": duplicate_id},
        )
        await db.commit()
        await db.refresh(canonical)
        return person_to_dict(canonical)
