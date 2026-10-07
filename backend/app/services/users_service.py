"""Portal-user persistence shared by authenticated self-service flows."""

import logging
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Person, Registration, User, VisitorMagicLink, VisitorSession
from app.utils import make_id

logger = logging.getLogger(__name__)

#: auth_source recorded for account-linking audit rows; the actor is the
#: OIDC subject (never the email, which would put PII in the audit trail).
ACCOUNT_LINK_AUTH_SOURCE = "keycloak"


def verified_email_from_claims(claims: dict[str, Any] | None) -> str | None:
    """Return the token's own email, only when Keycloak explicitly attests it.

    ``email_verified`` must be the boolean ``true``; usernames, unverified
    profile emails and service accounts never yield an email. Shared by
    contact access (#1192), registration claiming (#1044) and account
    linking (#1209) so all three apply one trust bar.
    """
    if claims is None:
        return None
    username = claims.get("preferred_username")
    if isinstance(username, str) and username.startswith("service-account-"):
        return None
    email = claims.get("email")
    if claims.get("email_verified") is True and isinstance(email, str) and email.strip():
        return email.strip().lower()
    return None


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
    ``app.routers.me.claim_verified_email_registrations`` (an OIDC user
    confirming their own verified email) and visitor magic-link redemption
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


async def resolve_oidc_user(db: AsyncSession, oidc_subject: str, verified_email: str | None) -> User:
    """Return the one portal user for a Keycloak account, joining a matching
    emailed-session identity to it (#1209).

    ``verified_email`` must come from ``verified_email_from_claims``. Keycloak
    stays authoritative for roles; this only decides which ``User`` row (and
    therefore which bookings) the OIDC subject maps to:

    * No user for the subject yet, but an email-only user holds the verified
      email: the subject is attached to that user, so its id, owned bookings,
      sessions and audit provenance are all preserved.
    * Both exist as separate users (an account that used both methods before
      linking existed): the email-only user's bookings and sessions move to
      the OIDC user and the duplicate row is removed. Both identities proved
      control of the same address, the same proof ``claim_unowned_registrations_for_email``
      accepts; registrations are never matched by email alone.
    * The user is already linked to a different email (the Keycloak address
      changed): the stale link is dropped first, so the old address can no
      longer reach this account, then the new address is linked.
    * Another Keycloak account already holds the address: nothing is linked
      and nothing is transferred; the caller keeps their own account.

    Idempotent and safe under concurrent logins: unique-constraint races roll
    back and re-read the winner's state instead of raising.
    """
    user = await db.scalar(select(User).where(User.oidc_subject == oidc_subject))
    if user is None and verified_email is not None:
        attached = await _attach_subject_to_email_user(db, oidc_subject, verified_email)
        if attached is not None:
            return attached
    if user is None:
        user = await get_or_create_user(db, oidc_subject)
    if verified_email is None or user.verified_email == verified_email:
        return user
    try:
        await _link_email(db, user, verified_email)
    except IntegrityError:
        await db.rollback()
        user = await db.scalar(select(User).where(User.oidc_subject == oidc_subject))
        if user is None:
            raise
    return user


async def _attach_subject_to_email_user(db: AsyncSession, oidc_subject: str, verified_email: str) -> User | None:
    email_user = await db.scalar(
        select(User).where(User.verified_email == verified_email, User.oidc_subject.is_(None)).with_for_update()
    )
    if email_user is None:
        return None
    email_user.oidc_subject = oidc_subject
    await write_audit_entry(
        db,
        actor=oidc_subject,
        auth_source=ACCOUNT_LINK_AUTH_SOURCE,
        action="account_linked",
        resource_type="user",
        resource_id=email_user.id,
        details={"method": "attached_subject"},
    )
    await db.execute(delete(VisitorMagicLink).where(VisitorMagicLink.email == verified_email))
    try:
        await db.commit()
    except IntegrityError:
        # A concurrent first login for the same subject created its own row.
        await db.rollback()
        return await db.scalar(select(User).where(User.oidc_subject == oidc_subject))
    await db.refresh(email_user)
    return email_user


async def _link_email(db: AsyncSession, user: User, verified_email: str) -> None:
    """Make *user* reachable by *verified_email*, merging a duplicate if needed."""
    details: dict[str, Any] = {"method": "linked_email"}
    if user.verified_email is not None:
        user.verified_email = None
        await db.flush()
        details["replaced_previous_email"] = True
    email_user = await db.scalar(select(User).where(User.verified_email == verified_email).with_for_update())
    if email_user is not None and email_user.oidc_subject is not None:
        logger.warning("Keycloak account %s shares a verified email with another account; not linked.", user.id)
        await db.commit()
        return
    if email_user is not None:
        moved = (
            await db.execute(
                update(Registration)
                .where(Registration.user_id == email_user.id)
                .values(user_id=user.id)
                .returning(Registration.id)
            )
        ).all()
        await db.execute(update(VisitorSession).where(VisitorSession.user_id == email_user.id).values(user_id=user.id))
        await db.execute(delete(User).where(User.id == email_user.id))
        await db.flush()
        details.update(method="merged_email_user", merged_user_id=email_user.id, registrations_moved=len(moved))
    user.verified_email = verified_email
    await db.execute(delete(VisitorMagicLink).where(VisitorMagicLink.email == verified_email))
    await write_audit_entry(
        db,
        actor=user.oidc_subject or user.id,
        auth_source=ACCOUNT_LINK_AUTH_SOURCE,
        action="account_linked",
        resource_type="user",
        resource_id=user.id,
        details=details,
    )
    await db.commit()
