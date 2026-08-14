"""Shared application-service operations for volunteers.

Used by both ``app.routers.volunteers`` (REST) and ``app.mcp.admin.volunteers``
(MCP). Volunteers are ``Person`` rows tagged with the ``volunteer`` role, with
help periods stored separately in ``VolunteerPeriod`` — see
``app.services.people_service``/``app.services.members_service`` for the
other ``Person``-backed services. Raises ``HTTPException`` directly (matching
the pre-existing shared helpers this consolidates, same convention as
``app/services/editions_service.py``) rather than the ``ServiceError``
hierarchy in ``app/services/errors.py``.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Person, VolunteerPeriod
from app.schemas import VolunteerCreate, VolunteerHelpPeriodIn, VolunteerUpdate
from app.utils import get_or_404, make_id, person_to_dict, roles_contains


def ensure_volunteer_role(person: Person) -> None:
    roles = set(person.roles or [])
    roles.add("volunteer")
    person.roles = sorted(roles)


def remove_volunteer_role(person: Person) -> None:
    person.roles = sorted(role for role in (person.roles or []) if role != "volunteer")


async def ensure_unique_fields(
    db: AsyncSession,
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    exclude_id: str | None = None,
) -> None:
    if national_register_number is not None:
        national_register_number = national_register_number.strip() or None
    if eid_document_number is not None:
        eid_document_number = eid_document_number.strip() or None

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


async def replace_help_periods(
    db: AsyncSession,
    volunteer_id: str,
    help_periods: list[VolunteerHelpPeriodIn],
) -> None:
    await db.execute(delete(VolunteerPeriod).where(VolunteerPeriod.volunteer_id == volunteer_id))
    for period in help_periods:
        db.add(
            VolunteerPeriod(
                volunteer_id=volunteer_id,
                first_help_day=period.first_help_day,
                last_help_day=period.last_help_day,
            )
        )


async def load_periods_map(db: AsyncSession, volunteer_ids: list[str]) -> dict[str, list[VolunteerPeriod]]:
    if not volunteer_ids:
        return {}
    rows = (
        (
            await db.execute(
                select(VolunteerPeriod)
                .where(VolunteerPeriod.volunteer_id.in_(volunteer_ids))
                .order_by(
                    VolunteerPeriod.volunteer_id,
                    VolunteerPeriod.first_help_day,
                    VolunteerPeriod.id,
                )
            )
        )
        .scalars()
        .all()
    )
    grouped: dict[str, list[VolunteerPeriod]] = defaultdict(list)
    for row in rows:
        grouped[row.volunteer_id].append(row)
    return grouped


async def get_volunteer_or_404(db: AsyncSession, volunteer_id: str) -> Person:
    volunteer = await get_or_404(db, Person, volunteer_id, "Volunteer not found.")
    if "volunteer" not in volunteer.roles:
        raise HTTPException(status_code=404, detail="Volunteer not found.")
    return volunteer


def to_volunteer_out(person: Person, help_periods: list[VolunteerPeriod]) -> dict:
    d = person_to_dict(person)
    return {
        "id": d["id"],
        "name": d["name"],
        "address": d["address"],
        "national_register_number": d["national_register_number"],
        "eid_document_number": d["eid_document_number"],
        "active": d["active"],
        "help_periods": [
            {
                "id": period.id,
                "first_help_day": period.first_help_day,
                "last_help_day": period.last_help_day,
            }
            for period in help_periods
        ],
        "created_at": d["created_at"],
        "updated_at": d["updated_at"],
    }


def search_volunteers_stmt(*, q: str | None = None, active: bool | None = None) -> Any:
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

    return stmt.order_by(Person.created_at.desc(), Person.id.desc())


async def create_volunteer(
    db: AsyncSession, *, body: VolunteerCreate, actor: str, request_id: str | None = None
) -> dict:
    await ensure_unique_fields(
        db,
        national_register_number=body.national_register_number,
        eid_document_number=body.eid_document_number,
    )

    person = Person(
        id=make_id("per"),
        name=body.name,
        address=body.address,
        national_register_number=body.national_register_number,
        eid_document_number=body.eid_document_number,
        active=body.active,
    )
    ensure_volunteer_role(person)

    db.add(person)
    await db.flush()
    await replace_help_periods(db, person.id, body.help_periods)
    await write_audit_entry(
        db,
        actor=actor,
        action="volunteer_created",
        resource_type="person",
        resource_id=person.id,
        request_id=request_id,
        details={"help_period_count": len(body.help_periods)},
    )
    await db.commit()
    await db.refresh(person)
    periods_map = await load_periods_map(db, [person.id])
    return to_volunteer_out(person, periods_map.get(person.id, []))


async def apply_volunteer_update(
    db: AsyncSession, volunteer: Person, body: VolunteerUpdate, *, actor: str, request_id: str | None = None
) -> dict:
    volunteer_id = volunteer.id

    if "national_register_number" in body.model_fields_set and body.national_register_number is not None:
        await ensure_unique_fields(
            db,
            national_register_number=body.national_register_number,
            exclude_id=volunteer_id,
        )
    if "eid_document_number" in body.model_fields_set and body.eid_document_number is not None:
        await ensure_unique_fields(
            db,
            eid_document_number=body.eid_document_number,
            exclude_id=volunteer_id,
        )

    for field in (
        "name",
        "address",
        "national_register_number",
        "eid_document_number",
        "active",
    ):
        if field in body.model_fields_set:
            setattr(volunteer, field, getattr(body, field))

    if "help_periods" in body.model_fields_set and body.help_periods is not None:
        await replace_help_periods(db, volunteer_id, body.help_periods)

    ensure_volunteer_role(volunteer)

    await write_audit_entry(
        db,
        actor=actor,
        action="volunteer_updated",
        resource_type="person",
        resource_id=volunteer.id,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(volunteer)
    periods_map = await load_periods_map(db, [volunteer.id])
    return to_volunteer_out(volunteer, periods_map.get(volunteer.id, []))


async def delete_volunteer(db: AsyncSession, volunteer: Person, *, actor: str, request_id: str | None = None) -> dict:
    """Remove the volunteer role from a person (soft archive).

    The underlying ``Person`` record is kept intact so that reservations,
    membership data, and audit history are preserved. Only the ``volunteer``
    role and associated help periods are removed.
    """
    volunteer_id = volunteer.id
    await db.execute(delete(VolunteerPeriod).where(VolunteerPeriod.volunteer_id == volunteer_id))
    remove_volunteer_role(volunteer)
    await write_audit_entry(
        db,
        actor=actor,
        action="volunteer_role_removed",
        resource_type="person",
        resource_id=volunteer_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "id": volunteer_id}
