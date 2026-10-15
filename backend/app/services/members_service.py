"""Shared application-service operations for members.

Used by both ``app.routers.members`` (REST) and ``app.mcp.admin.members``
(MCP). Members are ``Person`` rows tagged with the ``member`` role — see
``app.services.volunteers_service``/``app.services.people_service`` for the
other ``Person``-backed services. Raises ``HTTPException`` directly (matching
the pre-existing shared helpers this consolidates, same convention as
``app/services/editions_service.py``) rather than the ``ServiceError``
hierarchy in ``app/services/errors.py``.

Identity fields are normalised via ``people_service.normalise_optional_identity``
before both the uniqueness check and persistence, matching ``people_service``/
``volunteers_service`` exactly (the pre-baseline migration renormalised existing
rows; that repair logic remains preserved in the baseline).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Person
from app.schemas import PersonCreate, PersonUpdate
from app.services.people_listing import filtered_people_stmt, order_people_stmt
from app.services.people_service import normalise_optional_identity, normalise_roles, parse_phone
from app.services.role_history import reactivate_role, retire_role, set_role_start, sync_roles
from app.utils import get_or_404, make_id, person_to_dict


def ensure_member_role(person: Person, *, started_on: date | None = None) -> None:
    if "member" not in (person.roles or []):
        sync_roles(person, sorted({*(person.roles or []), "member"}))
        if started_on is not None:
            set_role_start(person, "member", started_on)


def has_member_role(person: Person) -> bool:
    return "member" in (person.roles or [])


async def ensure_unique_fields(
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


async def get_member_or_404(db: AsyncSession, person_id: str) -> Person:
    person = await get_or_404(db, Person, person_id, "Member not found.")
    if not has_member_role(person):
        raise HTTPException(status_code=404, detail="Member not found.")
    return person


async def create_member(db: AsyncSession, *, body: PersonCreate, actor: str, request_id: str | None = None) -> dict:
    nrr = normalise_optional_identity(body.national_register_number)
    eid = normalise_optional_identity(body.eid_document_number)
    await ensure_unique_fields(db, national_register_number=nrr, eid_document_number=eid)

    person = Person(
        id=make_id("per"),
        name=body.name,
        email=str(body.email).lower().strip() if body.email else "",
        phone=parse_phone(body.phone),
        preferred_language=body.preferred_language,
        address=body.address,
        national_register_number=nrr,
        eid_document_number=eid,
        visits_per_month=body.visits_per_month,
        notes=body.notes,
    )
    sync_roles(person, normalise_roles(body.roles))
    ensure_member_role(person)
    if body.member_since is not None:
        set_role_start(person, "member", body.member_since)

    db.add(person)
    await write_audit_entry(
        db,
        actor=actor,
        action="member_created",
        resource_type="person",
        resource_id=person.id,
        request_id=request_id,
        details={"roles": person.roles},
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Person with this national register number or eID document number already exists.",
        ) from exc
    await db.refresh(person)
    return person_to_dict(person)


def search_members_stmt(*, q: str | None = None, active: bool | None = None) -> Any:
    """Members (people holding the ``member`` role), filtered and ordered on the
    shared people list contract (``app.services.people_listing``): the same ``q``
    semantics as ``GET /api/people?role=member``, and a deterministic order
    ending in ``id``."""
    stmt = filtered_people_stmt(q=q, role="member", active=active)
    return order_people_stmt(stmt, q=q)


async def apply_member_update(
    db: AsyncSession, person: Person, body: PersonUpdate, *, actor: str, request_id: str | None = None
) -> dict:
    for field in ("name", "address", "preferred_language", "visits_per_month", "notes"):
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
        await ensure_unique_fields(db, national_register_number=nrr, exclude_id=person.id)
    if eid_in_set and eid is not None:
        await ensure_unique_fields(db, eid_document_number=eid, exclude_id=person.id)

    if nrr_in_set:
        person.national_register_number = nrr
    if eid_in_set:
        person.eid_document_number = eid

    if body.roles is not None:
        # The member role cannot be taken away through the member endpoints.
        sync_roles(person, sorted({*normalise_roles(body.roles), "member"}))
    ensure_member_role(person)
    if body.member_since is not None:
        set_role_start(person, "member", body.member_since)

    await write_audit_entry(
        db,
        actor=actor,
        action="member_updated",
        resource_type="person",
        resource_id=person.id,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Person with this national register number or eID document number already exists.",
        ) from exc
    await db.refresh(person)
    return person_to_dict(person)


async def deactivate_member(db: AsyncSession, person: Person, *, actor: str, request_id: str | None = None) -> dict:
    """End a person's membership: retire the ``member`` role, keep everything else.

    The role is retired, not removed: it stays in ``roles`` and ``retired_roles["member"]`` records
    the day, so the person stops counting as an active member without being archived as a whole
    (``Person.active``) and without touching their other roles. The ``Person`` record,
    registrations, check-ins and audit history all stay: attendance is what member benefits are
    earned from. Membership resumes with ``reactivate_member``. Erasing a person and their
    registrations is the separate ``people_service.delete_person``. Calling it again changes
    nothing and writes no second audit entry.
    """
    person_id = person.id
    if retire_role(person, "member"):
        await write_audit_entry(
            db,
            actor=actor,
            action="member_deactivated",
            resource_type="person",
            resource_id=person_id,
            request_id=request_id,
            details={},
        )
        await db.commit()
    return {"ended": True, "id": person_id}


async def reactivate_member(db: AsyncSession, person: Person, *, actor: str, request_id: str | None = None) -> dict:
    """Undo ``deactivate_member``: the person counts as an active member again. A repeat is a no-op."""
    person_id = person.id
    if reactivate_role(person, "member"):
        await write_audit_entry(
            db,
            actor=actor,
            action="member_reactivated",
            resource_type="person",
            resource_id=person_id,
            request_id=request_id,
            details={},
        )
        await db.commit()
    return {"reactivated": True, "id": person_id}
