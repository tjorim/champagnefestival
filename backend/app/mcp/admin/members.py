"""Admin (write) MCP tool implementations for member management.

Mirrors ``app.routers.members``. Business logic lives in
``app.services.members_service`` and is shared with the REST router. Members
are ``Person`` rows tagged with the ``member`` role — see
``app.mcp.admin.people`` for the general-purpose ``Person`` CRUD tools and
``app.mcp.admin.volunteers`` for the volunteer counterpart, which each have
their own REST router and rules.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.mcp.utils import MCPToolError, as_value_error, validate_with_schema
from app.schemas import PersonCreate, PersonUpdate
from app.services import members_service
from app.utils import person_to_dict


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
    async with session_factory() as db:
        try:
            return await members_service.create_member(db, body=body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        except IntegrityError as exc:
            await db.rollback()
            raise MCPToolError(
                "Person with this national register number or eID document number already exists."
            ) from exc


async def get_member(session_factory: Any, person_id: str) -> dict:
    async with session_factory() as db:
        try:
            person = await members_service.get_member_or_404(db, person_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return person_to_dict(person)


async def list_members(session_factory: Any, q: str | None = None, active: bool | None = None) -> dict:
    async with session_factory() as db:
        stmt = members_service.search_members_stmt(q=q, active=active)
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
            person = await members_service.get_member_or_404(db, person_id)
            return await members_service.apply_member_update(db, person, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        except IntegrityError as exc:
            await db.rollback()
            raise MCPToolError(
                "Person with this national register number or eID document number already exists."
            ) from exc


async def delete_member(session_factory: Any, actor: str, person_id: str) -> dict:
    async with session_factory() as db:
        try:
            person = await members_service.get_member_or_404(db, person_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return await members_service.delete_member(db, person, actor=actor)
