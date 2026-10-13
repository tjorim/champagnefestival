"""When a person held a role: one list of stretches per role.

``Person.roles`` says which roles a person holds; ``Person.role_history`` records *when*, as
``{role: [{"started_on": day | None, "ended_on": day | None}, ...]}`` (ISO days, oldest first).
A stretch with no ``ended_on`` is the one in progress; a ``started_on`` of ``None`` means the
start is unknown (the role predates the history). ``Person.retired_roles`` is the quick index of
roles whose latest stretch has ended (``{role: day it ended}``); this module is the only writer,
so the two never drift apart.

A role with no history at all is active with an unknown start, which is how every role that
existed before the history was introduced reads.

All writers assign fresh dicts/lists: the JSON columns are not mutation-tracked.
"""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status

from app.models import Person

Stretch = dict[str, str | None]


def _today() -> str:
    return date.today().isoformat()


def _history(person: Person, role: str) -> list[Stretch]:
    return [dict(stretch) for stretch in (person.role_history or {}).get(role, [])]


def _store(person: Person, role: str, stretches: list[Stretch]) -> None:
    person.role_history = {**(person.role_history or {}), role: stretches}


def _set_retired(person: Person, role: str, day: str | None) -> None:
    retired = {r: d for r, d in (person.retired_roles or {}).items() if r != role}
    if day is not None:
        retired[role] = day
    person.retired_roles = retired


def is_retired(person: Person, role: str) -> bool:
    return role in (person.retired_roles or {})


def _open_index(stretches: list[Stretch]) -> int | None:
    for index in range(len(stretches) - 1, -1, -1):
        if stretches[index].get("ended_on") is None:
            return index
    return None


def grant_role(person: Person, role: str, *, started_on: date | None = None) -> None:
    """The person has just been given *role*: open a stretch (a no-op while one is open)."""
    stretches = _history(person, role)
    if _open_index(stretches) is None:
        stretches.append({"started_on": (started_on or date.today()).isoformat(), "ended_on": None})
        _store(person, role, stretches)
    _set_retired(person, role, None)


def drop_role(person: Person, role: str) -> None:
    """*role* has been taken away: close the stretch in progress; the history stays."""
    stretches = _history(person, role)
    index = _open_index(stretches)
    if index is not None:
        stretches[index]["ended_on"] = _today()
        _store(person, role, stretches)
    _set_retired(person, role, None)


def sync_roles(person: Person, roles: list[str]) -> None:
    """Assign ``person.roles``, opening a stretch for each added role and closing each removed one."""
    previous = set(person.roles or [])
    person.roles = list(roles)
    for role in sorted(set(roles) - previous):
        grant_role(person, role)
    for role in sorted(previous - set(roles)):
        drop_role(person, role)


def retire_role(person: Person, role: str) -> bool:
    """Step back from *role*: close the stretch in progress. ``False`` if it was already retired."""
    if is_retired(person, role):
        return False
    today = _today()
    stretches = _history(person, role)
    index = _open_index(stretches)
    if index is None:
        stretches.append({"started_on": None, "ended_on": today})
    else:
        stretches[index]["ended_on"] = today
    _store(person, role, stretches)
    _set_retired(person, role, today)
    return True


def reactivate_role(person: Person, role: str) -> bool:
    """Undo ``retire_role``: open a new stretch today. ``False`` if the role was not retired."""
    if not is_retired(person, role):
        return False
    stretches = _history(person, role)
    stretches.append({"started_on": _today(), "ended_on": None})
    _store(person, role, stretches)
    _set_retired(person, role, None)
    return True


def set_role_start(person: Person, role: str, day: date) -> None:
    """Record when the current (or, if retired, the latest) stretch of *role* started."""
    stretches = _history(person, role)
    if not stretches:
        _store(person, role, [{"started_on": day.isoformat(), "ended_on": None}])
        return
    latest = stretches[-1]
    ended = latest.get("ended_on")
    if ended is not None and day.isoformat() > ended:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"The {role} role ended on {ended}; it cannot start after that.",
        )
    latest["started_on"] = day.isoformat()
    _store(person, role, stretches)


def role_since(person: Person, role: str) -> str | None:
    """Start day of the current (or latest) stretch of *role*, if known."""
    stretches = (person.role_history or {}).get(role, [])
    return stretches[-1].get("started_on") if stretches else None
