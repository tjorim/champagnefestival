"""The shared list contract for people-backed admin lists.

``GET /api/people`` and ``GET /api/volunteers`` (and the MCP volunteer list)
all filter and order ``Person`` rows through this module, so ``q`` means the
same thing everywhere and every sort is total: each ends in ``Person.id``, in
the same direction as the sort, so offset paging never skips or repeats a row
even when many rows share a sort value, and one btree index per sortable
column (see ``Person.__table_args__``) can serve either direction.
"""

from __future__ import annotations

from typing import Any, Literal

from sqlalchemy import Text, cast, or_, select
from sqlalchemy.sql import Select

from app.dependencies import SortDirection
from app.models import Person
from app.services.operational_search import person_search_order_by, person_search_predicate
from app.utils import roles_contains

PersonSortKey = Literal["name", "email", "created", "updated"]
VolunteerSortKey = Literal["name", "created", "updated"]

# Name and email sort on the trigger-maintained, unaccented, lower-cased
# `search_*` columns so "élodie" sorts with the e's and "bob" before "Chris",
# which a plain collation-dependent sort on `name`/`email` would not guarantee.
_SORT_COLUMNS: dict[str, Any] = {
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
        Person.club_name.ilike(like, escape="\\"),
        Person.notes.ilike(like, escape="\\"),
        cast(Person.roles, Text).ilike(like, escape="\\"),
    )


def filtered_people_stmt(
    *,
    q: str | None = None,
    role: str | None = None,
    active: bool | None = None,
) -> Select[Any]:
    """``select(Person)`` with the shared filters applied and no ordering."""
    stmt = select(Person)
    if active is not None:
        stmt = stmt.where(Person.active == active)
    if role:
        stmt = stmt.where(roles_contains(role))
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
            column.desc() if descending else column.asc(),
            Person.id.desc() if descending else Person.id.asc(),
        )
    if q and (q_stripped := q.strip()):
        return stmt.order_by(*person_search_order_by(name=q_stripped, email=q_stripped))
    return stmt.order_by(Person.created_at.desc(), Person.id.desc())
