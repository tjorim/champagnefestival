"""Current-member email invariant shared by every person write path."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import violated_constraint_name
from app.models import Person
from app.services.errors import ApiHTTPException
from app.services.people_listing import role_active
from app.utils import roles_contains


def email_conflict() -> ApiHTTPException:
    return ApiHTTPException(
        status_code=409, code="member_email_in_use", detail="A current member already uses this email."
    )


def check_email_integrity(exc: IntegrityError) -> None:
    if (
        "uq_people_current_member_email" in str(exc.orig)
        or violated_constraint_name(exc) == "uq_people_current_member_email"
    ):
        raise email_conflict() from exc


async def ensure_member_email(db: AsyncSession, person: Person, *, exclude_ids: tuple[str, ...] = ()) -> None:
    if "member" not in (person.roles or []) or person.anonymised or "member" in (person.retired_roles or {}):
        return
    email = (person.email or "").strip().lower()
    if not email:
        return
    # Updates are already staged on the object; never flush them before validating.
    with db.no_autoflush:
        conflict = await db.scalar(
            select(Person.id)
            .where(
                roles_contains("member"),
                role_active("member"),
                func.lower(func.trim(Person.email)) == email,
                Person.id.not_in((person.id, *exclude_ids)),
            )
            .limit(1)
        )
    if conflict is not None:
        await db.rollback()
        raise email_conflict()


async def flush_member_changes(db: AsyncSession) -> None:
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        check_email_integrity(exc)
        raise


async def commit_member_changes(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        check_email_integrity(exc)
        raise
