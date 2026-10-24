"""Admin (write) MCP tool implementations for member management.

Mirrors ``app.routers.members``. Business logic lives in
``app.services.members_service`` and is shared with the REST router. Members
are ``Person`` rows tagged with the ``member`` role — see
``app.mcp.admin.people`` for the general-purpose ``Person`` CRUD tools and
``app.mcp.admin.volunteers`` for the volunteer counterpart, which each have
their own REST router and rules.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException

from app.dependencies import SortDirection
from app.mcp.utils import as_value_error, validate_with_schema
from app.schemas import PersonCreate, PersonUpdate
from app.services import members_service
from app.services.people_listing import (
    PersonSortKey,
    filtered_people_stmt,
    inactivity_cutoff,
    last_attended,
    order_people_stmt,
)
from app.services.settings_service import get_or_create_settings
from app.utils import person_summary_dict


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
    inactivity_exempt: bool = False,
    inactivity_exempt_note: str = "",
    notes: str = "",
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
        notes=notes,
        inactivity_exempt=inactivity_exempt,
        inactivity_exempt_note=inactivity_exempt_note,
    )
    async with session_factory() as db:
        try:
            return await members_service.create_member(db, body=body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def get_member(session_factory: Any, person_id: str) -> dict:
    async with session_factory() as db:
        try:
            person = await members_service.get_member_or_404(db, person_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return person_summary_dict(person)


async def list_members(
    session_factory: Any,
    q: str | None = None,
    active: bool | None = None,
    *,
    sort: PersonSortKey | None = None,
    sort_dir: SortDirection = "asc",
    last_attended_before: date | None = None,
    last_attended_after: date | None = None,
) -> dict:
    async with session_factory() as db:
        stmt = order_people_stmt(
            filtered_people_stmt(
                q=q,
                role="member",
                active=active,
                last_attended_before=last_attended_before,
                last_attended_after=last_attended_after,
            ).add_columns(last_attended),
            q=q,
            sort=sort,
            sort_dir=sort_dir,
        )
        rows = (await db.execute(stmt)).all()
        settings = await get_or_create_settings(db)
        cutoff = (
            inactivity_cutoff(datetime.now(UTC).date(), settings.member_inactivity_months)
            if settings.member_inactivity_months
            else None
        )
        return {
            "members": [
                {
                    **person_summary_dict(p),
                    "last_attended": attended.isoformat() if attended else None,
                    "inactivity_highlight": bool(cutoff and attended and attended < cutoff and not p.inactivity_exempt),
                }
                for p, attended in rows
            ]
        }


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
    inactivity_exempt: bool | None = None,
    inactivity_exempt_note: str | None = None,
    notes: str | None = None,
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
            "notes": notes,
            "inactivity_exempt": inactivity_exempt,
            "inactivity_exempt_note": inactivity_exempt_note,
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


async def deactivate_member(session_factory: Any, actor: str, person_id: str) -> dict:
    async with session_factory() as db:
        try:
            person = await members_service.get_member_or_404(db, person_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return await members_service.deactivate_member(db, person, actor=actor)


async def reactivate_member(session_factory: Any, actor: str, person_id: str) -> dict:
    """Undo ``deactivate_member``: the person counts as an active member again."""
    async with session_factory() as db:
        try:
            person = await members_service.get_member_or_404(db, person_id)
            return await members_service.reactivate_member(db, person, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
