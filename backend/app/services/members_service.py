"""Shared application-service operations for members.

Used by both ``app.routers.members`` (REST) and ``app.mcp.admin.members``
(MCP). Members are ``Person`` rows tagged with the ``member`` role — see
``app.services.volunteers_service``/``app.services.people_service`` for the
other ``Person``-backed services. Raises ``HTTPException`` directly (matching
the pre-existing shared helpers this consolidates, same convention as
``app/services/editions_service.py``) rather than the ``ServiceError``
hierarchy in ``app/services/errors.py``.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Person
from app.schemas import PersonCreate, PersonUpdate
from app.services import people_service
from app.services.people_service import normalise_roles, parse_phone
from app.utils import get_or_404, make_id, person_to_dict, roles_contains


def normalise_optional_identity(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def ensure_member_role(person: Person) -> None:
    roles = set(person.roles or [])
    roles.add("member")
    person.roles = sorted(roles)


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
        address=body.address,
        national_register_number=nrr,
        eid_document_number=eid,
        visits_per_month=body.visits_per_month,
        club_name=body.club_name,
        notes=body.notes,
        active=body.active,
    )
    person.roles = normalise_roles(body.roles)
    ensure_member_role(person)

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

    return stmt.order_by(Person.created_at.desc(), Person.id.desc())


async def apply_member_update(
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
        await ensure_unique_fields(db, national_register_number=nrr, exclude_id=person.id)
    if eid_in_set and eid is not None:
        await ensure_unique_fields(db, eid_document_number=eid, exclude_id=person.id)

    if nrr_in_set:
        person.national_register_number = nrr
    if eid_in_set:
        person.eid_document_number = eid

    if body.roles is not None:
        person.roles = normalise_roles(body.roles)
    ensure_member_role(person)

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


async def delete_member(db: AsyncSession, person: Person, *, actor: str, request_id: str | None = None) -> dict:
    """Remove a member (and cascade-delete their registrations).

    Delegates the shared cascade-delete/audit/live-publish routine to
    ``people_service.delete_person``, tagged with the ``member_deleted`` audit
    action instead of ``person_deleted``.
    """
    return await people_service.delete_person(db, person, actor=actor, request_id=request_id, action="member_deleted")
