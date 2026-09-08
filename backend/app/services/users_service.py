"""Portal-user persistence shared by authenticated self-service flows."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Person, Registration, User
from app.utils import make_id


async def get_or_create_user(db: AsyncSession, oidc_subject: str, *, commit: bool = True) -> User:
    """Return the portal user for an OIDC subject, creating it if necessary."""
    user = await db.scalar(select(User).where(User.oidc_subject == oidc_subject))
    if user is None:
        user = User(id=make_id("usr"), oidc_subject=oidc_subject)
        if commit:
            db.add(user)
            try:
                await db.commit()
            except IntegrityError:
                await db.rollback()
                user = await db.scalar(select(User).where(User.oidc_subject == oidc_subject))
                if user is None:
                    raise
        else:
            try:
                async with db.begin_nested():
                    db.add(user)
                    await db.flush()
            except IntegrityError:
                user = await db.scalar(select(User).where(User.oidc_subject == oidc_subject))
                if user is None:
                    raise
        await db.refresh(user)
    return user


async def get_or_create_user_by_email(db: AsyncSession, verified_email: str, *, commit: bool = True) -> User:
    """Return the visitor portal user for a magic-link-verified email, creating it if necessary.

    Mirrors ``get_or_create_user``'s shape exactly (#953 decision 1) — same
    create-then-recover-from-a-concurrent-insert pattern, keyed by
    ``User.verified_email`` instead of ``User.oidc_subject``.
    """
    user = await db.scalar(select(User).where(User.verified_email == verified_email))
    if user is None:
        user = User(id=make_id("usr"), verified_email=verified_email)
        if commit:
            db.add(user)
            try:
                await db.commit()
            except IntegrityError:
                await db.rollback()
                user = await db.scalar(select(User).where(User.verified_email == verified_email))
                if user is None:
                    raise
        else:
            try:
                async with db.begin_nested():
                    db.add(user)
                    await db.flush()
            except IntegrityError:
                user = await db.scalar(select(User).where(User.verified_email == verified_email))
                if user is None:
                    raise
        await db.refresh(user)
    return user


async def claim_unowned_registrations_for_email(
    db: AsyncSession,
    user: User,
    email: str,
    *,
    actor: str,
    auth_source: str | None = None,
) -> None:
    """Attach every currently-unowned registration for *email* to *user*.

    Convergent: a registration already owned by *user* or by anyone else is
    left untouched — this only ever moves ``Registration.user_id`` from
    ``NULL`` to a value, never reassigns an already-owned one (#953's
    existing-owner-protection acceptance criterion). Shared by
    ``app.routers.me.claim_my_registrations`` (an OIDC user proving email
    control via a one-shot lookup token) and visitor magic-link redemption
    (the link itself is that same proof).

    Does not commit — caller commits as part of the same transaction.
    """
    registrations = (
        await db.scalars(
            select(Registration)
            .join(Person, Registration.person_id == Person.id)
            .where(Person.email == email, Registration.user_id.is_(None))
            .with_for_update()
        )
    ).all()
    for registration in registrations:
        registration.user_id = user.id
        await write_audit_entry(
            db,
            actor=actor,
            action="registration_claimed",
            resource_type="registration",
            resource_id=registration.id,
            auth_source=auth_source,
        )
