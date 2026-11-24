"""Which person is this account? (#1655)

``people`` (the directory record) and ``users`` (the sign-in account) describe the same human. The link is the
nullable, unique ``people.user_id``; this module is the only place that reads or writes it, so "who is this
account" has one answer everywhere:

* ``person_for_account`` is the one lookup.
* ``link_person`` is the one write. It refuses to move a person that already belongs to another account, to give
  an account a second person, and to link an anonymised record.
* ``link_by_verified_email`` is the only *inferred* link. It exists for people nobody has linked yet (guest
  bookings, imported contacts) and is deliberately narrow, because a ``people.email`` value is typed by whoever
  made the booking, not proven by its owner:

  - only a **verified** address counts: a magic-link redemption or a token whose ``email_verified`` is the
    boolean ``true`` (see ``users_service.verified_email_from_claims``). An unverified string never links;
  - the address must belong to **exactly one** non-anonymised person. When it is shared (a household using one
    inbox, a retyped duplicate that was never merged) the link is not guessed: it stays empty until an admin
    merges the duplicates or links the account;
  - a person that is already linked to another account is never taken over;
  - a person with a national register number, an eID number or the volunteer role is never linked this way. That
    identity is established only by the volunteer themselves (``volunteer_self_service``, #1006) or by an admin.

Identity-document and role checks are about the *person*; an account that proves an address can still read and
claim its own bookings through the confirm-first claim flow (#1044) without being linked to a person.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Person, User
from app.services.audit_service import write_audit_entry
from app.services.errors import ApiHTTPException


def normalise_email(email: str | None) -> str:
    """The one normalisation for comparing people's addresses: trimmed and lower-cased."""
    return (email or "").strip().lower()


def email_matches(email: str):
    """SQL predicate: ``people.email`` holds *email* (compared trimmed and case-insensitively)."""
    return func.lower(func.trim(Person.email)) == normalise_email(email)


async def person_for_account(
    db: AsyncSession, *, user_id: str | None = None, subject: str | None = None
) -> Person | None:
    """The person linked to an account, identified by ``User.id`` or, for OIDC callers, by their subject.

    Exactly one of the two is given. Returns ``None`` when nothing is linked, never guesses.
    """
    if (user_id is None) == (subject is None):
        raise ValueError("Pass exactly one of user_id or subject.")
    statement = select(Person)
    if user_id is not None:
        statement = statement.where(Person.user_id == user_id)
    else:
        statement = statement.join(User, User.id == Person.user_id).where(User.oidc_subject == subject)
    return (await db.execute(statement)).scalar_one_or_none()


def account_conflict(
    detail: str = "This person or account is already linked to another account or person.",
) -> ApiHTTPException:
    return ApiHTTPException(status_code=409, code="person_account_conflict", detail=detail)


async def link_person(
    db: AsyncSession,
    person: Person,
    user: User,
    *,
    method: str,
    actor: str,
    auth_source: str | None = None,
    request_id: str | None = None,
) -> bool:
    """Link *person* to *user*; return whether anything changed. Does not commit.

    Idempotent for the same pair. Raises ``person_account_conflict`` (409) when *person* already belongs to a
    different account, when *user* already has a different person, or when *person* is anonymised.
    """
    if person.user_id == user.id:
        return False
    if person.user_id is not None or person.anonymised:
        raise account_conflict()
    # Locked so two concurrent links for one account cannot both pass the check (the unique index would
    # still stop the second, but as an opaque IntegrityError at commit).
    existing = await db.scalar(select(Person.id).where(Person.user_id == user.id).with_for_update())
    if existing is not None:
        raise account_conflict()
    person.user_id = user.id
    person.user = user
    await db.flush()
    await write_audit_entry(
        db,
        actor=actor,
        auth_source=auth_source,
        action="person_account_linked",
        resource_type="person",
        resource_id=person.id,
        request_id=request_id,
        details={"method": method, "user_id": user.id},
    )
    return True


async def unlink_person(
    db: AsyncSession,
    person: Person,
    *,
    method: str,
    actor: str,
    auth_source: str | None = None,
    request_id: str | None = None,
) -> bool:
    """Remove *person*'s account link; return whether there was one. Does not commit."""
    if person.user_id is None:
        return False
    previous = person.user_id
    person.user_id = None
    person.user = None
    await db.flush()
    await write_audit_entry(
        db,
        actor=actor,
        auth_source=auth_source,
        action="person_account_unlinked",
        resource_type="person",
        resource_id=person.id,
        request_id=request_id,
        details={"method": method, "user_id": previous},
    )
    return True


async def link_by_verified_email(
    db: AsyncSession,
    user: User,
    verified_email: str | None,
    *,
    actor: str,
    auth_source: str | None = None,
    request_id: str | None = None,
) -> Person | None:
    """Return *user*'s person, linking the one unambiguous record that holds its verified address.

    *verified_email* must come from a verified source (``verified_email_from_claims`` or a magic-link session);
    ``None`` never links. See the module docstring for why the match is this narrow. Does not commit.
    """
    linked = await person_for_account(db, user_id=user.id)
    if linked is not None:
        return linked
    email = normalise_email(verified_email)
    if not email:
        return None
    holders = list(
        (await db.scalars(select(Person).where(email_matches(email), ~Person.anonymised).with_for_update())).all()
    )
    if len(holders) != 1:
        return None
    candidate = holders[0]
    if (
        candidate.user_id is not None
        or candidate.national_register_number
        or candidate.eid_document_number
        or "volunteer" in candidate.roles
    ):
        return None
    await link_person(db, candidate, user, method="verified_email", actor=actor, auth_source=auth_source)
    return candidate
