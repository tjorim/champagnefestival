"""Admin (write) MCP tool implementations for volunteer management.

Mirrors ``app.routers.volunteers`` (except ``export_volunteers_csv``, which is
out of scope for MCP tools). Volunteers are ``Person`` rows tagged with the
``volunteer`` role, with help periods stored separately in
``VolunteerPeriod`` — see ``app.mcp.admin.people`` / ``app.mcp.admin.members``
for the other ``Person``-backed MCP modules.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError

from app.audit import write_audit_entry
from app.mcp.utils import as_value_error, validate_with_schema
from app.models import Person, VolunteerPeriod
from app.routers.volunteers import _ensure_unique_fields as _volunteer_ensure_unique_fields
from app.routers.volunteers import (
    _ensure_volunteer_role,
    _get_volunteer_or_404,
    _load_periods_map,
    _remove_volunteer_role,
    _replace_help_periods,
    _to_volunteer_out,
)
from app.schemas import VolunteerCreate, VolunteerUpdate
from app.utils import make_id, roles_contains


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
            await _volunteer_ensure_unique_fields(
                db,
                national_register_number=body.national_register_number,
                eid_document_number=body.eid_document_number,
            )
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        person = Person(
            id=make_id("per"),
            name=body.name,
            address=body.address,
            national_register_number=body.national_register_number,
            eid_document_number=body.eid_document_number,
            active=body.active,
        )
        _ensure_volunteer_role(person)

        db.add(person)
        await db.flush()
        await _replace_help_periods(db, person.id, body.help_periods)
        await write_audit_entry(
            db,
            actor=actor,
            action="volunteer_created",
            resource_type="person",
            resource_id=person.id,
            details={"help_period_count": len(body.help_periods)},
        )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise ValueError(
                "Person with this national register number or eID document number already exists."
            ) from exc
        await db.refresh(person)
        periods_map = await _load_periods_map(db, [person.id])
        return _to_volunteer_out(person, periods_map.get(person.id, []))


async def get_volunteer(session_factory: Any, volunteer_id: str) -> dict:
    async with session_factory() as db:
        try:
            volunteer = await _get_volunteer_or_404(db, volunteer_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        periods_map = await _load_periods_map(db, [volunteer.id])
        return _to_volunteer_out(volunteer, periods_map.get(volunteer.id, []))


async def list_volunteers(session_factory: Any, q: str | None = None, active: bool | None = None) -> dict:
    async with session_factory() as db:
        stmt = select(Person).where(roles_contains("volunteer"))

        if active is not None:
            stmt = stmt.where(Person.active == active)

        if q:
            q_escaped = q.strip().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
            q_like = f"%{q_escaped}%"
            stmt = stmt.where(
                or_(
                    Person.name.ilike(q_like, escape="\\"),
                    Person.address.ilike(q_like, escape="\\"),
                    Person.national_register_number.ilike(q_like, escape="\\"),
                    Person.eid_document_number.ilike(q_like, escape="\\"),
                )
            )

        stmt = stmt.order_by(Person.created_at.desc(), Person.id.desc())
        rows = (await db.execute(stmt)).scalars().all()
        periods_map = await _load_periods_map(db, [row.id for row in rows])
        return {"volunteers": [_to_volunteer_out(v, periods_map.get(v.id, [])) for v in rows]}


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
            volunteer = await _get_volunteer_or_404(db, volunteer_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        try:
            if body.national_register_number is not None:
                await _volunteer_ensure_unique_fields(
                    db,
                    national_register_number=body.national_register_number,
                    exclude_id=volunteer_id,
                )
            if body.eid_document_number is not None:
                await _volunteer_ensure_unique_fields(
                    db,
                    eid_document_number=body.eid_document_number,
                    exclude_id=volunteer_id,
                )
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        if body.name is not None:
            volunteer.name = body.name
        if body.address is not None:
            volunteer.address = body.address
        if body.national_register_number is not None:
            volunteer.national_register_number = body.national_register_number
        if body.eid_document_number is not None:
            volunteer.eid_document_number = body.eid_document_number
        if body.active is not None:
            volunteer.active = body.active

        if body.help_periods is not None:
            await _replace_help_periods(db, volunteer_id, body.help_periods)

        _ensure_volunteer_role(volunteer)

        await write_audit_entry(
            db,
            actor=actor,
            action="volunteer_updated",
            resource_type="person",
            resource_id=volunteer.id,
            details={"fields_changed": sorted(body.model_fields_set)},
        )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise ValueError(
                "Person with this national register number or eID document number already exists."
            ) from exc
        await db.refresh(volunteer)
        periods_map = await _load_periods_map(db, [volunteer.id])
        return _to_volunteer_out(volunteer, periods_map.get(volunteer.id, []))


async def delete_volunteer(session_factory: Any, actor: str, volunteer_id: str) -> dict:
    """Remove the volunteer role from a person (soft archive).

    Mirrors ``app.routers.volunteers.delete_volunteer``: the underlying
    ``Person`` record and its non-volunteer data (membership, reservations,
    audit history) are kept intact. Only the ``volunteer`` role and its
    associated help periods are removed.
    """
    async with session_factory() as db:
        try:
            volunteer = await _get_volunteer_or_404(db, volunteer_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        await db.execute(delete(VolunteerPeriod).where(VolunteerPeriod.volunteer_id == volunteer_id))
        _remove_volunteer_role(volunteer)
        await write_audit_entry(
            db,
            actor=actor,
            action="volunteer_role_removed",
            resource_type="person",
            resource_id=volunteer_id,
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": volunteer_id}
