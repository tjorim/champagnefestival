"""Admin (write) MCP tool implementations for people management.

Mirrors ``app.routers.people``. Business logic lives in
``app.services.people_service`` and is shared with the REST router. Members
and volunteers are also ``Person`` rows (see ``app.mcp.admin.members`` /
``app.mcp.admin.volunteers``) but each has its own REST router with its own
rules, so they get their own MCP module too rather than being folded into
this one.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.mcp.utils import MCPToolError, as_value_error, get_or_error, validate_with_schema
from app.models import Person
from app.schemas import PersonCreate, PersonUpdate
from app.services import people_service
from app.utils import person_to_dict


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
    async with session_factory() as db:
        try:
            return await people_service.create_person(db, body=body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


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
        try:
            return await people_service.apply_person_update(db, person, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def delete_person(session_factory: Any, actor: str, person_id: str) -> dict:
    async with session_factory() as db:
        person = await get_or_error(db, Person, person_id, f"Person '{person_id}' not found.")
        return await people_service.delete_person(db, person, actor=actor)


async def merge_people(session_factory: Any, actor: str, person_id: str, duplicate_id: str) -> dict:
    """Merge duplicate_id into person_id.

    See ``app.services.people_service.merge_people`` for the exact semantics
    this mirrors.
    """
    if person_id == duplicate_id:
        raise MCPToolError("Cannot merge a person with themselves.")

    async with session_factory() as db:
        canonical = await get_or_error(db, Person, person_id, f"Person '{person_id}' not found.")
        duplicate = await get_or_error(db, Person, duplicate_id, f"Person '{duplicate_id}' not found.")
        try:
            return await people_service.merge_people(db, canonical, duplicate, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
