"""Verified visitor membership gate shared by public booking and waitlist writes."""

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Person, User
from app.services.errors import ApiHTTPException
from app.services.people_listing import role_active
from app.utils import roles_contains
from app.visitor_session import COOKIE_NAME, resolve_session


async def visitor_user(db: AsyncSession, request: Request) -> User | None:
    session_id = request.cookies.get(COOKIE_NAME)
    session = await resolve_session(db, session_id) if session_id else None
    return await db.get(User, session.user_id) if session else None


async def verified_member(db: AsyncSession, user: User | None) -> tuple[Person, User]:
    if user is None:
        raise ApiHTTPException(401, "member_sign_in_required", "Sign in with a verified visitor session.")
    email = (user.verified_email or "").strip().lower() if user else ""
    person = (
        await db.scalar(
            select(Person).where(
                roles_contains("member"),
                role_active("member"),
                func.lower(func.trim(Person.email)) == email,
                Person.anonymised.is_(False),
            )
        )
        if email
        else None
    )
    if person is None or user is None:
        raise ApiHTTPException(403, "membership_required", "A current membership is required.")
    return person, user
