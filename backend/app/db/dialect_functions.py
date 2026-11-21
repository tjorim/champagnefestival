"""SQL functions that differ between PostgreSQL (production) and SQLite (local development and tests)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement


class json_array_elements(FunctionElement):  # noqa: N801 - named after the SQL function it renders
    """Table-valued ``json_array_elements(json)``; one ``value`` column per array element.

    Renders as ``json_each(json)`` on SQLite, whose ``value`` column (and ``->>`` operator)
    behave the same way.
    """

    name = "json_array_elements"
    inherit_cache = True


class json_array_elements_text(FunctionElement):  # noqa: N801
    """Table-valued ``json_array_elements_text(json)``; array elements as text in ``value``."""

    name = "json_array_elements_text"
    inherit_cache = True


@compiles(json_array_elements)
@compiles(json_array_elements_text)
def _postgresql(element: FunctionElement, compiler: Any, **kw: Any) -> str:
    return f"{element.name}({compiler.process(element.clauses, **kw)})"


@compiles(json_array_elements, "sqlite")
@compiles(json_array_elements_text, "sqlite")
def _sqlite(element: FunctionElement, compiler: Any, **kw: Any) -> str:
    return f"json_each({compiler.process(element.clauses, **kw)})"


class trim_spaces(FunctionElement):
    """Trim ASCII spaces using PostgreSQL's reflected SQL-standard syntax."""

    type = String()
    inherit_cache = True


@compiles(trim_spaces)
def _trim_spaces_postgresql(element: FunctionElement, compiler: Any, **kw: Any) -> str:
    return f"TRIM(BOTH FROM {compiler.process(element.clauses, **kw)})"


@compiles(trim_spaces, "sqlite")
def _trim_spaces_sqlite(element: FunctionElement, compiler: Any, **kw: Any) -> str:
    return f"trim({compiler.process(element.clauses, **kw)})"


def dialect_insert(db: AsyncSession) -> Any:
    """The ``insert`` construct of *db*'s dialect, for ``on_conflict_do_nothing`` and friends.

    PostgreSQL's and SQLite's constructs share that API, so callers need not branch.
    """
    return sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgresql_insert


async def assign_positions(
    db: AsyncSession, items: Mapping[str, Any], ordered_ids: Sequence[str], attribute: str = "sort_order"
) -> None:
    """Give each item the position of its id in *ordered_ids* (0..N-1).

    The positions are unique through a ``DEFERRABLE INITIALLY DEFERRED`` constraint, which
    PostgreSQL checks at commit, so rows can be reassigned in any order. SQLite checks each
    row, so there the rows first move to distinct negative positions.
    """
    if db.get_bind().dialect.name == "sqlite":
        for index, item_id in enumerate(ordered_ids):
            setattr(items[item_id], attribute, -(index + 1))
        await db.flush()
    for index, item_id in enumerate(ordered_ids):
        setattr(items[item_id], attribute, index)
