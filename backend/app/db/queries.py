"""Query helpers shared by routers, services and MCP tools."""

from collections.abc import Sequence
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Text, cast
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.interfaces import ORMOption

from app.db.base import Base
from app.models import Person


async def get_or_404[T: Base](
    db: AsyncSession,
    model: type[T],
    object_id: Any,
    detail: str,
    *,
    options: Sequence[ORMOption] | None = None,
) -> T:
    # populate_existing ensures loader options (e.g. selectinload) are applied even when the
    # instance is already present in the identity map — for example an object that was just added
    # and committed, leaving its relationships expired. Without this, Session.get returns the
    # cached instance without eager-loading, and accessing a relationship later triggers a lazy
    # load outside the async greenlet (MissingGreenlet).
    obj = await db.get(model, object_id, options=options, populate_existing=options is not None)
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj


def roles_contains(role: str) -> Any:
    """Return a SQLAlchemy filter expression that matches Person.roles JSON arrays
    containing *role* as an exact element (case-insensitive).

    Casts the JSON column to Text so the LIKE works on PostgreSQL.
    We match the quoted token so that a role like "member" never accidentally
    matches "non-member".
    """
    role_norm = role.strip().lower()
    role_escaped = role_norm.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    return cast(Person.roles, Text).ilike(f'%"{role_escaped}"%', escape="\\")
