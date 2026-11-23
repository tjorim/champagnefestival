"""Mutations of the ordered role periods behind directory membership."""

from datetime import date
from typing import get_args

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vocabularies import DirectoryRole
from app.models import Person, PersonRolePeriod
from app.models.base import _utcnow
from app.services.errors import ApiHTTPException


async def lock_role_people(db: AsyncSession, *people: Person, required_role: str | None = None) -> None:
    """Lock the parent rows before editing periods, then reload the ordered history."""
    ids = {person.id for person in people}
    locked = (
        await db.scalars(
            select(Person)
            .where(Person.id.in_(ids))
            .order_by(Person.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).all()
    if len(locked) != len(ids) or (required_role and required_role not in locked[0].roles):
        raise HTTPException(status_code=404, detail=f"{(required_role or 'person').capitalize()} not found.")


def normalise_roles(roles: list[str]) -> list[str]:
    normalised = {role.strip().lower() for role in roles if role.strip()}
    if normalised.difference(get_args(DirectoryRole)):
        raise ApiHTTPException(
            status_code=422, code="invalid_directory_role", detail="Choose member or volunteer roles."
        )
    return sorted(normalised)


def _touch(person: Person) -> None:
    # For a new person the insert supplies both timestamps together.
    if person.created_at is not None:
        person.updated_at = _utcnow()


def _append(
    person: Person, role: str, started_on: date | None, *, ended_on: date | None = None, removed: bool = False
) -> None:
    latest = person.latest_role_periods.get(role)
    person.role_periods.append(
        PersonRolePeriod(
            role=role,
            position=latest.position + 1 if latest else 0,
            started_on=started_on,
            ended_on=ended_on,
            removed=removed,
        )
    )
    _touch(person)


def is_retired(person: Person, role: str) -> bool:
    return role in person.retired_roles


def grant_role(person: Person, role: str, *, started_on: date | None = None) -> None:
    """Open a period if the role is not currently active."""
    latest = person.latest_role_periods.get(role)
    if latest is None or latest.ended_on is not None:
        _append(person, role, started_on or date.today())


def drop_role(person: Person, role: str) -> None:
    """Remove the directory role and retain its history."""
    latest = person.latest_role_periods[role]
    latest.ended_on = latest.ended_on or date.today()
    latest.removed = True
    _touch(person)


def sync_roles(person: Person, roles: list[str]) -> None:
    previous = set(person.roles)
    requested = set(roles)
    for role in sorted(previous - requested):
        drop_role(person, role)
    for role in sorted(requested - previous):
        grant_role(person, role)


def retire_role(person: Person, role: str) -> bool:
    if is_retired(person, role):
        return False
    person.latest_role_periods[role].ended_on = date.today()
    _touch(person)
    return True


def reactivate_role(person: Person, role: str) -> bool:
    if not is_retired(person, role):
        return False
    grant_role(person, role)
    return True


def set_role_start(person: Person, role: str, day: date) -> None:
    latest = person.latest_role_periods[role]
    if latest.ended_on is not None and day > latest.ended_on:
        raise ApiHTTPException(
            status_code=422,
            code="invalid_role_start",
            detail=f"The {role} role ended on {latest.ended_on}; it cannot start after that.",
        )
    latest.started_on = day
    _touch(person)


def role_since(person: Person, role: str) -> str | None:
    latest = person.latest_role_periods.get(role)
    return latest.started_on.isoformat() if latest and latest.started_on else None


def merge_roles(canonical: Person, duplicate: Person) -> None:
    """Keep the canonical history for shared roles and adopt previously unheld roles."""
    held = set(canonical.roles)
    for role in duplicate.roles:
        if role not in held:
            for period in duplicate.role_periods:
                if period.role == role:
                    _append(canonical, role, period.started_on, ended_on=period.ended_on, removed=period.removed)
        elif is_retired(canonical, role) and not is_retired(duplicate, role):
            _append(canonical, role, duplicate.latest_role_periods[role].started_on)
