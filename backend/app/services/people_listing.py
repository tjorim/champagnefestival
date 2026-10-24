"""The shared list contract for people-backed admin lists.

``GET /api/people`` and ``GET /api/volunteers`` (and the MCP volunteer list)
all filter and order ``Person`` rows through this module, so ``q`` means the
same thing everywhere and every sort is total: each ends in ``Person.id``, in
the same direction as the sort, so offset paging never skips or repeats a row
even when many rows share a sort value. Stored sort columns have composite
btree indexes; registration counts use the indexed registration person_id.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any, Literal

from sqlalchemy import Text, and_, cast, func, or_, select
from sqlalchemy.sql import Select

from app.dependencies import SortDirection
from app.models import Edition, Event, Person, Registration, StampCard, StampCardReward
from app.services.operational_search import person_search_order_by, person_search_predicate
from app.utils import roles_contains

PersonSortKey = Literal["name", "email", "created", "updated", "registration_count", "last_attended"]
VolunteerSortKey = Literal["name", "created", "updated"]

# Name and email sort on the trigger-maintained, unaccented, lower-cased
# `search_*` columns so "élodie" sorts with the e's and "bob" before "Chris",
# which a plain collation-dependent sort on `name`/`email` would not guarantee.
registration_count = (
    select(func.count(Registration.id)).where(Registration.person_id == Person.id).correlate(Person).scalar_subquery()
)

# EXISTS avoids duplicating people when several rewards are outstanding.
reward_due = (
    select(StampCardReward.id)
    .join(StampCard, StampCard.id == StampCardReward.card_id)
    .where(StampCard.person_id == Person.id, StampCardReward.handed_out_at.is_(None))
    .correlate(Person)
    .exists()
)

last_attended = (
    select(func.max(Event.date))
    .join(Registration, Registration.event_id == Event.id)
    .join(Edition, Edition.id == Event.edition_id)
    .where(
        Registration.person_id == Person.id,
        Registration.checked_in.is_(True),
        Edition.edition_type == "capsule_exchange",
    )
    .correlate(Person)
    .scalar_subquery()
)


def inactivity_cutoff(today: date, months: int) -> date:
    """Subtract calendar months, clamping the day at the end of the target month."""
    year, month = divmod(today.year * 12 + today.month - 1 - months, 12)
    return date(year, month + 1, min(today.day, monthrange(year, month + 1)[1]))


_SORT_COLUMNS: dict[str, Any] = {
    "last_attended": last_attended,
    "registration_count": registration_count,
    "name": Person.search_name,
    "email": Person.search_email,
    "created": Person.created_at,
    "updated": Person.updated_at,
}


def _like_pattern(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    return f"%{escaped}%"


def person_search_filter(q: str) -> Any:
    """The one ``q`` semantics for people-backed lists.

    Case-insensitive substring match over name, email, phone, address, NISS,
    eID document number, club and notes and roles, plus the fuzzy name/email
    matching of ``person_search_predicate``.
    """
    like = _like_pattern(q)
    return or_(
        person_search_predicate(name=q, email=q),
        Person.phone.ilike(like, escape="\\"),
        Person.address.ilike(like, escape="\\"),
        Person.national_register_number.ilike(like, escape="\\"),
        Person.eid_document_number.ilike(like, escape="\\"),
        Person.notes.ilike(like, escape="\\"),
        cast(Person.roles, Text).ilike(like, escape="\\"),
    )


def role_retired(role: str, column: Any = None) -> Any:
    """True when *role* is a key of the person's ``retired_roles`` (``column`` for subqueries)."""
    column = Person.retired_roles if column is None else column
    return func.json_extract_path_text(column, role.strip().lower()).is_not(None)


def role_active(role: str, *, anonymised_column: Any = None, retired_column: Any = None) -> Any:
    """Active in *role*: the person is not anonymised and has not retired the role."""
    anonymised_column = Person.anonymised if anonymised_column is None else anonymised_column
    return and_(anonymised_column.is_(False), ~role_retired(role, retired_column))


def filtered_people_stmt(
    *,
    q: str | None = None,
    role: str | None = None,
    active: bool | None = None,
    reward_due_filter: bool | None = None,
    last_attended_before: date | None = None,
    last_attended_after: date | None = None,
) -> Select[Any]:
    """``select(Person)`` with the shared filters applied and no ordering.

    ``active`` means "not anonymised" without a ``role``. With a ``role`` it means active *in that role*:
    not anonymised and not retired from it (so ``active=false`` lists those who retired the role,
    and everyone who is anonymised).
    """
    stmt = select(Person)
    if reward_due_filter is not None:
        stmt = stmt.where(reward_due if reward_due_filter else ~reward_due)
    if last_attended_before is not None:
        stmt = stmt.where(last_attended < last_attended_before)
    if last_attended_after is not None:
        stmt = stmt.where(last_attended >= last_attended_after)
    if role:
        stmt = stmt.where(roles_contains(role))
    if active is not None:
        if role:
            stmt = stmt.where(role_active(role) if active else ~role_active(role))
        else:
            stmt = stmt.where(Person.anonymised == (not active))
    if q and (q_stripped := q.strip()):
        stmt = stmt.where(person_search_filter(q_stripped))
    return stmt


def order_people_stmt[SelectT: Select[Any]](
    stmt: SelectT,
    *,
    q: str | None = None,
    sort: str | None = None,
    sort_dir: SortDirection = "asc",
) -> SelectT:
    """Order a person statement deterministically.

    An explicit ``sort`` always wins (including over relevance); otherwise a
    search is ordered by relevance (ending in ``name, id``) and a plain list
    newest first. Every branch ends in ``Person.id``.
    """
    if sort is not None:
        column = _SORT_COLUMNS[sort]
        descending = sort_dir == "desc"
        return stmt.order_by(
            (column.desc() if descending else column.asc()).nulls_last(),
            Person.id.desc() if descending else Person.id.asc(),
        )
    if q and (q_stripped := q.strip()):
        return stmt.order_by(*person_search_order_by(name=q_stripped, email=q_stripped))
    return stmt.order_by(Person.created_at.desc(), Person.id.desc())
