"""Admin (write) MCP tool implementations for volunteer management.

Mirrors ``app.routers.volunteers`` (except ``export_volunteers_csv``, which is
out of scope for MCP tools). Business logic lives in
``app.services.volunteers_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.mcp.utils import as_value_error, validate_with_schema
from app.schemas import VolunteerCreate, VolunteerUpdate
from app.services import volunteers_service


async def create_volunteer(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    national_register_number: str,
    eid_document_number: str,
    address: str = "",
    active: bool = True,
    help_periods: list[dict],
) -> dict:
    body = validate_with_schema(
        VolunteerCreate,
        name=name,
        address=address,
        national_register_number=national_register_number,
        eid_document_number=eid_document_number,
        active=active,
        help_periods=help_periods,
    )
    async with session_factory() as db:
        try:
            return await volunteers_service.create_volunteer(db, body=body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def get_volunteer(session_factory: Any, volunteer_id: str) -> dict:
    async with session_factory() as db:
        try:
            volunteer = await volunteers_service.get_volunteer_or_404(db, volunteer_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        periods_map = await volunteers_service.load_periods_map(db, [volunteer.id])
        return volunteers_service.to_volunteer_out(volunteer, periods_map.get(volunteer.id, []))


async def list_volunteers(session_factory: Any, q: str | None = None, active: bool | None = None) -> dict:
    async with session_factory() as db:
        stmt = volunteers_service.search_volunteers_stmt(q=q, active=active)
        rows = (await db.execute(stmt)).scalars().all()
        periods_map = await volunteers_service.load_periods_map(db, [row.id for row in rows])
        return {"volunteers": [volunteers_service.to_volunteer_out(v, periods_map.get(v.id, [])) for v in rows]}


async def update_volunteer(
    session_factory: Any,
    actor: str,
    volunteer_id: str,
    *,
    name: str | None = None,
    address: str | None = None,
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    active: bool | None = None,
    help_periods: list[dict] | None = None,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "name": name,
            "address": address,
            "national_register_number": national_register_number,
            "eid_document_number": eid_document_number,
            "active": active,
            "help_periods": help_periods,
        }.items()
        if v is not None
    }
    body = validate_with_schema(VolunteerUpdate, **provided)

    async with session_factory() as db:
        try:
            volunteer = await volunteers_service.get_volunteer_or_404(db, volunteer_id)
            return await volunteers_service.apply_volunteer_update(db, volunteer, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def delete_volunteer(session_factory: Any, actor: str, volunteer_id: str) -> dict:
    """Remove the volunteer role from a person (soft archive).

    See ``app.services.volunteers_service.delete_volunteer`` for the exact
    semantics.
    """
    async with session_factory() as db:
        try:
            volunteer = await volunteers_service.get_volunteer_or_404(db, volunteer_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        return await volunteers_service.delete_volunteer(db, volunteer, actor=actor)
