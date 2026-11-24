"""Shared application-service operations for volunteers.

Used by both ``app.routers.volunteers`` (REST) and ``app.mcp.admin.volunteers``
(MCP). Volunteers are ``Person`` rows tagged with the ``volunteer`` role, with
help periods stored separately in ``VolunteerPeriod`` — see
``app.services.people_service``/``app.services.members_service`` for the
other ``Person``-backed services. Raises ``HTTPException`` directly (matching
the pre-existing shared helpers this consolidates, same convention as
``app/services/editions_service.py``) rather than the ``ServiceError``
hierarchy in ``app/services/errors.py``.

Identity fields are normalised via ``people_service.normalise_optional_identity``
before both the uniqueness check and persistence, matching ``people_service``/
``members_service`` exactly (the pre-baseline migration renormalised existing
rows; that repair logic remains preserved in the baseline).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date as dt_date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import SortDirection
from app.core.ids import make_id
from app.db.queries import get_or_404
from app.models import Person, VolunteerPeriod
from app.schemas import VolunteerCreate, VolunteerHelpPeriodIn, VolunteerOut, VolunteerPeriodOut, VolunteerUpdate
from app.services.audit_service import write_audit_entry
from app.services.errors import ApiHTTPException
from app.services.people_listing import filtered_people_stmt, order_people_stmt
from app.services.people_service import normalise_optional_identity
from app.services.person_account import link_person, unlink_person
from app.services.role_history import lock_role_people, reactivate_role, retire_role, set_role_start, sync_roles
from app.services.serializers import person_to_out
from app.services.users_service import get_or_create_user


def ensure_volunteer_role(person: Person, *, started_on: dt_date | None = None) -> None:
    if "volunteer" not in (person.roles or []):
        sync_roles(person, sorted({*(person.roles or []), "volunteer"}))
        if started_on is not None:
            set_role_start(person, "volunteer", started_on)


async def ensure_unique_fields(
    db: AsyncSession,
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    exclude_id: str | None = None,
) -> None:
    """Check for a conflicting row. Callers are expected to have already run
    identity values through ``normalise_optional_identity`` (see
    ``create_volunteer``/``apply_volunteer_update``) — this only queries with
    what it's given."""
    if national_register_number is not None:
        stmt = select(Person).where(Person.national_register_number == national_register_number)
        if exclude_id:
            stmt = stmt.where(Person.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise ApiHTTPException(
                code="person_niss_conflict",
                status_code=409,
                detail="Person with this national register number already exists.",
            )

    if eid_document_number is not None:
        stmt = select(Person).where(Person.eid_document_number == eid_document_number)
        if exclude_id:
            stmt = stmt.where(Person.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise ApiHTTPException(
                code="person_eid_conflict",
                status_code=409,
                detail="Person with this eID document number already exists.",
            )


async def set_account_link(
    db: AsyncSession, volunteer: Person, subject: str | None, *, actor: str, request_id: str | None = None
) -> None:
    """Admin link/unlink of a volunteer's sign-in account by OIDC subject (#1006, #1655).

    The subject is an administrator's assertion, the same trust the field always carried; the account
    row is created if that subject has never signed in. An account already linked to another person is
    never taken over (409 ``person_account_conflict``); replacing a volunteer's own link is an explicit
    admin action and is audited as an unlink followed by a link.
    """
    if subject is None:
        await unlink_person(db, volunteer, method="admin", actor=actor, request_id=request_id)
        return
    user = await get_or_create_user(db, subject, commit=False)
    if volunteer.user_id is not None and volunteer.user_id != user.id:
        await unlink_person(db, volunteer, method="admin_relink", actor=actor, request_id=request_id)
    await link_person(db, volunteer, user, method="admin", actor=actor, request_id=request_id)


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
                notes=period.notes,
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


def to_volunteer_out(person: Person, help_periods: list[VolunteerPeriod]) -> VolunteerOut:
    return VolunteerOut.model_validate(
        {
            **person_to_out(person).model_dump(),
            "oidc_subject": person.oidc_subject,
            "help_periods": [VolunteerPeriodOut.model_validate(period) for period in help_periods],
        }
    )


def search_volunteers_stmt(
    *,
    q: str | None = None,
    active: bool | None = None,
    sort: str | None = None,
    sort_dir: SortDirection = "asc",
) -> Any:
    """Volunteers (people holding the ``volunteer`` role), filtered and ordered
    on the shared people list contract (``app.services.people_listing``): the
    same ``q`` semantics as ``GET /api/people``, and a deterministic order
    ending in ``id``."""
    stmt = filtered_people_stmt(q=q, role="volunteer", active=active)
    return order_people_stmt(stmt, q=q, sort=sort, sort_dir=sort_dir)


async def create_volunteer(
    db: AsyncSession, *, body: VolunteerCreate, actor: str, request_id: str | None = None
) -> VolunteerOut:
    nrr = normalise_optional_identity(body.national_register_number)
    eid = normalise_optional_identity(body.eid_document_number)
    await ensure_unique_fields(db, national_register_number=nrr, eid_document_number=eid)

    person = Person(
        id=make_id("per"),
        name=body.name,
        address=body.address,
        national_register_number=nrr,
        eid_document_number=eid,
    )
    ensure_volunteer_role(person, started_on=min((period.first_help_day for period in body.help_periods), default=None))

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
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiHTTPException(
            code="person_identity_conflict",
            status_code=409,
            detail="Person with this national register number or eID document number already exists.",
        ) from exc
    await db.refresh(person)
    periods_map = await load_periods_map(db, [person.id])
    return to_volunteer_out(person, periods_map.get(person.id, []))


async def apply_volunteer_update(
    db: AsyncSession, volunteer: Person, body: VolunteerUpdate, *, actor: str, request_id: str | None = None
) -> VolunteerOut:
    await lock_role_people(db, volunteer, required_role="volunteer")
    volunteer_id = volunteer.id

    nrr_in_set = "national_register_number" in body.model_fields_set
    eid_in_set = "eid_document_number" in body.model_fields_set
    subject_in_set = "oidc_subject" in body.model_fields_set
    nrr = normalise_optional_identity(body.national_register_number) if nrr_in_set else None
    eid = normalise_optional_identity(body.eid_document_number) if eid_in_set else None

    if nrr_in_set and nrr is not None:
        await ensure_unique_fields(db, national_register_number=nrr, exclude_id=volunteer_id)
    if eid_in_set and eid is not None:
        await ensure_unique_fields(db, eid_document_number=eid, exclude_id=volunteer_id)

    for field in ("name", "address"):
        if field in body.model_fields_set:
            setattr(volunteer, field, getattr(body, field))

    if nrr_in_set:
        volunteer.national_register_number = nrr
    if eid_in_set:
        volunteer.eid_document_number = eid
    if subject_in_set:
        await set_account_link(db, volunteer, body.oidc_subject, actor=actor, request_id=request_id)

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
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiHTTPException(
            code="person_identity_conflict",
            status_code=409,
            detail="Person with this national register number or eID document number already exists.",
        ) from exc
    await db.refresh(volunteer)
    periods_map = await load_periods_map(db, [volunteer.id])
    return to_volunteer_out(volunteer, periods_map.get(volunteer.id, []))


async def deactivate_volunteer(
    db: AsyncSession, volunteer: Person, *, actor: str, request_id: str | None = None
) -> dict:
    """End a person's volunteering (they step back); everything stays on file.

    Whether someone is still part of the volunteer pool is whether the ``volunteer`` role is
    retired, not their help periods: a period only covers the days around one festival, so most
    volunteers have no current period between editions, and skipping one edition does not end
    anything. Ending volunteering therefore retires the role (``retired_roles["volunteer"]``
    records the day; their other roles and the person-wide ``active`` flag are untouched) and
    closes any help period that is still open (``last_help_day`` becomes today, or the period's
    first day if it has not started yet). The ``volunteer`` role, the ``Person`` record, every help
    period, registrations and audit history are kept: the periods are what an insurance claim
    needs ("who was covered on which day"). Volunteering resumes with ``reactivate_volunteer`` and
    a new help period. Calling it again changes nothing and writes no second audit entry.
    """
    await lock_role_people(db, volunteer, required_role="volunteer")
    volunteer_id = volunteer.id
    closed_ids = (
        (
            await db.execute(
                update(VolunteerPeriod)
                .where(VolunteerPeriod.volunteer_id == volunteer_id, VolunteerPeriod.last_help_day.is_(None))
                .values(last_help_day=func.greatest(VolunteerPeriod.first_help_day, dt_date.today()))
                .returning(VolunteerPeriod.id)
            )
        )
        .scalars()
        .all()
    )
    newly_retired = retire_role(volunteer, "volunteer")
    if newly_retired or closed_ids:
        await write_audit_entry(
            db,
            actor=actor,
            action="volunteer_deactivated",
            resource_type="person",
            resource_id=volunteer_id,
            request_id=request_id,
            details={"newly_retired": newly_retired, "closed_open_periods": len(closed_ids)},
        )
        await db.commit()
    return {"ended": True, "id": volunteer_id}


async def reactivate_volunteer(
    db: AsyncSession, volunteer: Person, *, actor: str, request_id: str | None = None
) -> dict:
    """Undo ``deactivate_volunteer``: the person counts as an active volunteer again.

    Help periods are not reopened; add a new period for the next stretch. A repeat is a no-op.
    """
    await lock_role_people(db, volunteer, required_role="volunteer")
    volunteer_id = volunteer.id
    if reactivate_role(volunteer, "volunteer"):
        await write_audit_entry(
            db,
            actor=actor,
            action="volunteer_reactivated",
            resource_type="person",
            resource_id=volunteer_id,
            request_id=request_id,
            details={},
        )
        await db.commit()
    return {"reactivated": True, "id": volunteer_id}
