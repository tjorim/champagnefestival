"""Admin (write) MCP tool implementations for member management.

Mirrors ``app.routers.members``. Members are ``Person`` rows tagged with the
``member`` role — see ``app.mcp.admin.people`` for the general-purpose
``Person`` CRUD tools and ``app.mcp.admin.volunteers`` for the volunteer
counterpart, which each have their own REST router and rules.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.live import live_bus
from app.live import mapping as live_mapping
from app.mcp.utils import as_value_error, validate_with_schema
from app.models import Person, Registration
from app.routers.members import _ensure_member_role, _get_member_or_404
from app.routers.members import _ensure_unique_fields as _member_ensure_unique_fields
from app.routers.members import _normalise_optional_identity as _member_normalise_optional_identity
from app.routers.members import _normalise_roles as _member_normalise_roles
from app.routers.people import parse_phone
from app.schemas import PersonCreate, PersonUpdate
from app.utils import make_id, person_to_dict, roles_contains

logger = logging.getLogger(__name__)


async def create_member(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    email: str | None = None,
    phone: str = "",
    address: str = "",
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    visits_per_month: int | None = None,
    club_name: str = "",
    notes: str = "",
    active: bool = True,
    roles: list[str] | None = None,
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
    nrr = _member_normalise_optional_identity(body.national_register_number)
    eid = _member_normalise_optional_identity(body.eid_document_number)

    async with session_factory() as db:
        try:
            await _member_ensure_unique_fields(db, national_register_number=nrr, eid_document_number=eid)
            phone_value = parse_phone(body.phone)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        person = Person(
            id=make_id("per"),
            name=body.name,
            email=str(body.email).lower().strip() if body.email else "",
            phone=phone_value,
            address=body.address,
            national_register_number=nrr,
            eid_document_number=eid,
            visits_per_month=body.visits_per_month,
            club_name=body.club_name,
            notes=body.notes,
            active=body.active,
        )
        person.roles = _member_normalise_roles(body.roles)
        _ensure_member_role(person)

        db.add(person)
        await write_audit_entry(
            db,
            actor=actor,
            action="member_created",
            resource_type="person",
            resource_id=person.id,
            details={"roles": person.roles},
        )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise ValueError(
                "Person with this national register number or eID document number already exists."
            ) from exc
        await db.refresh(person)
        return person_to_dict(person)


async def get_member(session_factory: Any, person_id: str) -> dict:
    async with session_factory() as db:
        try:
            person = await _get_member_or_404(db, person_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return person_to_dict(person)


async def list_members(session_factory: Any, q: str | None = None, active: bool | None = None) -> dict:
    async with session_factory() as db:
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

        stmt = stmt.order_by(Person.created_at.desc(), Person.id.desc())
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return {"members": [person_to_dict(p) for p in rows]}


async def update_member(
    session_factory: Any,
    actor: str,
    person_id: str,
    *,
    name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    address: str | None = None,
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    visits_per_month: int | None = None,
    club_name: str | None = None,
    notes: str | None = None,
    active: bool | None = None,
    roles: list[str] | None = None,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "name": name,
            "email": email,
            "phone": phone,
            "address": address,
            "national_register_number": national_register_number,
            "eid_document_number": eid_document_number,
            "visits_per_month": visits_per_month,
            "club_name": club_name,
            "notes": notes,
            "active": active,
            "roles": roles,
        }.items()
        if v is not None
    }
    body = validate_with_schema(PersonUpdate, **provided)

    async with session_factory() as db:
        try:
            person = await _get_member_or_404(db, person_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        if body.name is not None:
            person.name = body.name
        if body.phone is not None:
            try:
                person.phone = parse_phone(body.phone)
            except HTTPException as exc:
                raise as_value_error(exc) from exc
        if body.address is not None:
            person.address = body.address
        if body.visits_per_month is not None:
            person.visits_per_month = body.visits_per_month
        if body.club_name is not None:
            person.club_name = body.club_name
        if body.notes is not None:
            person.notes = body.notes
        if body.active is not None:
            person.active = body.active

        if body.email is not None:
            person.email = str(body.email).lower().strip() if body.email else ""

        nrr = _member_normalise_optional_identity(body.national_register_number)
        eid = _member_normalise_optional_identity(body.eid_document_number)

        try:
            if body.national_register_number is not None and nrr is not None:
                await _member_ensure_unique_fields(db, national_register_number=nrr, exclude_id=person.id)
            if body.eid_document_number is not None and eid is not None:
                await _member_ensure_unique_fields(db, eid_document_number=eid, exclude_id=person.id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        if body.national_register_number is not None:
            person.national_register_number = nrr
        if body.eid_document_number is not None:
            person.eid_document_number = eid

        if body.roles is not None:
            person.roles = _member_normalise_roles(body.roles)
        _ensure_member_role(person)

        await write_audit_entry(
            db,
            actor=actor,
            action="member_updated",
            resource_type="person",
            resource_id=person.id,
            details={"fields_changed": sorted(body.model_fields_set)},
        )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise ValueError(
                "Person with this national register number or eID document number already exists."
            ) from exc
        await db.refresh(person)
        return person_to_dict(person)


async def delete_member(session_factory: Any, actor: str, person_id: str) -> dict:
    async with session_factory() as db:
        try:
            person = await _get_member_or_404(db, person_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

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
            action="member_deleted",
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
