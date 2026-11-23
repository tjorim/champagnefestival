"""Query helpers shared by routers, services and MCP tools."""

from collections.abc import Sequence
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.orm.interfaces import ORMOption

from app.db.base import Base
from app.models import Person, PersonRolePeriod


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


def directory_role_period():
    """SQL predicate matching the latest, unremoved period of each directory role."""
    newer = aliased(PersonRolePeriod)
    return and_(
        PersonRolePeriod.removed.is_(False),
        ~select(newer.position)
        .where(
            newer.person_id == PersonRolePeriod.person_id,
            newer.role == PersonRolePeriod.role,
            newer.position > PersonRolePeriod.position,
        )
        .correlate(PersonRolePeriod)
        .exists(),
    )


def roles_contains(role: str):
    return (
        select(PersonRolePeriod.position)
        .where(
            PersonRolePeriod.person_id == Person.id,
            PersonRolePeriod.role == role.strip().lower(),
            directory_role_period(),
        )
        .correlate(Person)
        .exists()
    )
