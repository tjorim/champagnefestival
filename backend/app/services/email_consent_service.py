"""Per-category email consent (#1408).

Consent belongs to the recipient ``Person`` and is written only through the person's own action:
the signed-in preferences screen, or the emailed confirmation link behind the registration form's
updates option. Administrators can view consent and record an opt-out, never grant it. Withdrawing
closes the open record and a later grant opens a new one, so the history survives.

A signed-in caller is tied to people only through their *verified email address*: the people whose
email equals it. Access to a booking (``Registration.user_id``) does not authorise consent for the
booking's contact address.
"""

from __future__ import annotations

import hashlib
import secrets
from collections.abc import Collection
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import EmailCategory, EmailConsent, EmailConsentConfirmation, Person
from app.services.email_categories_service import NEW_EDITIONS, active_roles, person_allows
from app.services.errors import NotFoundError, ServiceError
from app.utils import make_id

SELF_SERVICE = "self_service"
REGISTRATION_FORM = "registration_form"
ADMIN = "admin"
MERGED = "merged"

CONFIRMATION_TTL = timedelta(days=7)
CONFIRMATION_RESEND_AFTER = timedelta(hours=1)
"""A confirmation mail is not sent again to the same person and category sooner than this, so a
registration form cannot be used to mail someone repeatedly."""


def normalise_email(email: str | None) -> str:
    return (email or "").strip().lower()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def people_for_email(db: AsyncSession, email: str, *, lock: bool = False) -> list[Person]:
    """The people whose address is *email*, best match first (most current roles, then oldest).

    An anonymised person only keeps their address while a consent is still active; they are included
    so the owner of the address can still see and withdraw it, but they never hold a new grant
    (``person_allows`` refuses them).
    """
    normalised = normalise_email(email)
    if not normalised:
        return []
    statement = select(Person).where(func.lower(func.trim(Person.email)) == normalised)
    if lock:
        statement = statement.with_for_update()
    people = list((await db.scalars(statement)).all())
    return sorted(people, key=lambda person: (-len(active_roles(person)), person.created_at, person.id))


async def _categories(db: AsyncSession) -> list[EmailCategory]:
    return list((await db.scalars(select(EmailCategory).order_by(EmailCategory.sort_order, EmailCategory.key))).all())


async def _open_consents(db: AsyncSession, person_ids: list[str]) -> list[EmailConsent]:
    if not person_ids:
        return []
    return list(
        (
            await db.scalars(
                select(EmailConsent).where(EmailConsent.person_id.in_(person_ids), EmailConsent.revoked_at.is_(None))
            )
        ).all()
    )


def _holder(people: list[Person], category: EmailCategory) -> Person | None:
    """The person a new grant is recorded on: the best match that may use the category."""
    return next((person for person in people if person_allows(person, category)), None)


async def preferences(db: AsyncSession, email: str | None, *, locale: str | None = None) -> dict:
    """The categories available to the people behind *email*, each with its current state."""
    people = await people_for_email(db, email or "")
    consents = {consent.category_key: consent for consent in await _open_consents(db, [p.id for p in people])}
    categories = []
    for category in await _categories(db):
        if _holder(people, category) is None and category.key not in consents:
            continue
        consent = consents.get(category.key)
        categories.append(
            {
                "key": category.key,
                "name": category.localized_name(locale),
                "description": category.localized_description(locale),
                "automatic": category.automatic,
                "consented": consent is not None,
                "granted_at": consent.granted_at if consent else None,
            }
        )
    return {"email": normalise_email(email) or None, "categories": categories}


def _new_consent(person: Person, category: EmailCategory, source: str) -> EmailConsent:
    return EmailConsent(
        id=make_id("ecn"),
        person_id=person.id,
        category_key=category.key,
        granted_at=datetime.now(UTC),
        source=source,
    )


def _grant(db: AsyncSession, person: Person, category: EmailCategory, source: str) -> EmailConsent:
    consent = _new_consent(person, category, source)
    db.add(consent)
    return consent


async def _add_unless_concurrent(db: AsyncSession, row: EmailConsent | EmailConsentConfirmation) -> bool:
    """Insert in a savepoint; ``False`` when a concurrent request already created the same record.

    The registration form can be submitted twice at once. The unique index keeps one open consent or
    pending confirmation, and the loser must not fail the whole registration.
    """
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        return False
    return True


async def update_preferences(
    db: AsyncSession,
    email: str,
    wanted: dict[str, bool],
    *,
    actor: str,
    auth_source: str | None,
    request_id: str | None = None,
) -> None:
    """Set the wanted state for the listed categories; the others stay unchanged.

    Every key is validated before anything is written. Absolute state, so repeating a request
    converges and writes nothing the second time.
    """
    people = await people_for_email(db, email, lock=True)
    categories = {category.key: category for category in await _categories(db)}
    open_by_key: dict[str, list[EmailConsent]] = {}
    for consent in await _open_consents(db, [person.id for person in people]):
        open_by_key.setdefault(consent.category_key, []).append(consent)

    for key, grant in wanted.items():
        category = categories.get(key)
        if category is None:
            raise NotFoundError(f"Email category '{key}' not found.", code="email_category_not_found")
        if grant and not open_by_key.get(key) and _holder(people, category) is None:
            raise ServiceError(
                f"Email category '{key}' is not available to this person.",
                status_code=403,
                code="email_category_unavailable",
            )

    now = datetime.now(UTC)
    for key, grant in wanted.items():
        open_rows = open_by_key.get(key, [])
        if grant and not open_rows:
            holder = _holder(people, categories[key])
            assert holder is not None  # validated above
            consent = _grant(db, holder, categories[key], SELF_SERVICE)
            await _audit(db, "email_consent_granted", consent, actor, auth_source, request_id)
        elif not grant:
            for consent in open_rows:
                consent.revoked_at = now
                consent.revoked_source = SELF_SERVICE
                await _audit(db, "email_consent_revoked", consent, actor, auth_source, request_id)
            await db.execute(
                delete(EmailConsentConfirmation).where(
                    EmailConsentConfirmation.person_id.in_([person.id for person in people]),
                    EmailConsentConfirmation.category_key == key,
                )
            )
    await db.commit()


async def _audit(
    db: AsyncSession,
    action: str,
    consent: EmailConsent,
    actor: str,
    auth_source: str | None,
    request_id: str | None,
    **details: object,
) -> None:
    await write_audit_entry(
        db,
        actor=actor,
        auth_source=auth_source,
        action=action,
        resource_type="email_consent",
        resource_id=consent.id,
        request_id=request_id,
        details={"person_id": consent.person_id, "category_key": consent.category_key, **details},
    )


# --- registration form: updates when a new edition opens -------------------------------------------------


async def request_new_editions_consent(
    db: AsyncSession,
    person: Person,
    *,
    verified_emails: Collection[str],
    actor: str,
    auth_source: str | None = None,
    request_id: str | None = None,
) -> tuple[str, EmailCategory] | None:
    """Handle the registration form's updates option for *person*.

    Consent becomes active only for a verified address: right away when the caller is signed in with
    exactly this address (*verified_emails* holds the addresses the caller's sign-in proved),
    otherwise through an emailed confirmation. Returns the token to email with its category, or
    ``None`` when nothing needs sending (already consented, address verified, throttled, or the
    category is missing or not open to this person). Does not commit.
    """
    category = await db.get(EmailCategory, NEW_EDITIONS)
    address = normalise_email(person.email)
    if category is None or not address or not person_allows(person, category):
        return None
    if await db.scalar(
        select(EmailConsent.id)
        .where(
            EmailConsent.person_id == person.id,
            EmailConsent.category_key == category.key,
            EmailConsent.revoked_at.is_(None),
        )
        .limit(1)
    ):
        return None

    if address in {normalise_email(email) for email in verified_emails}:
        consent = _new_consent(person, category, REGISTRATION_FORM)
        if await _add_unless_concurrent(db, consent):
            await _audit(db, "email_consent_granted", consent, actor, auth_source, request_id)
        return None

    now = datetime.now(UTC)
    await db.execute(delete(EmailConsentConfirmation).where(EmailConsentConfirmation.expires_at < now))
    pending = await db.scalar(
        select(EmailConsentConfirmation).where(
            EmailConsentConfirmation.person_id == person.id,
            EmailConsentConfirmation.category_key == category.key,
        )
    )
    if pending is not None:
        if _aware(pending.created_at) > now - CONFIRMATION_RESEND_AFTER:
            return None
        await db.delete(pending)
        await db.flush()
    token = secrets.token_urlsafe(24)
    confirmation = EmailConsentConfirmation(
        id=make_id("ecc"),
        person_id=person.id,
        category_key=category.key,
        token_hash=hash_token(token),
        expires_at=now + CONFIRMATION_TTL,
        created_at=now,
    )
    if not await _add_unless_concurrent(db, confirmation):
        return None
    return token, category


async def confirm_consent(db: AsyncSession, token: str, *, request_id: str | None = None) -> EmailCategory:
    """Activate the consent behind an emailed confirmation link; the link works once."""
    confirmation = (
        await db.execute(
            select(EmailConsentConfirmation)
            .where(EmailConsentConfirmation.token_hash == hash_token(token))
            .with_for_update()
        )
    ).scalar_one_or_none()
    invalid = NotFoundError("Invalid or expired confirmation link.", code="consent_confirmation_invalid")
    if confirmation is None:
        raise invalid
    person = await db.get(Person, confirmation.person_id)
    category = await db.get(EmailCategory, confirmation.category_key)
    expired = _aware(confirmation.expires_at) <= datetime.now(UTC)
    await db.delete(confirmation)
    if expired or person is None or category is None or not normalise_email(person.email):
        await db.commit()
        raise invalid
    if not person_allows(person, category):
        await db.commit()
        raise invalid
    already = await db.scalar(
        select(EmailConsent.id)
        .where(
            EmailConsent.person_id == person.id,
            EmailConsent.category_key == category.key,
            EmailConsent.revoked_at.is_(None),
        )
        .limit(1)
    )
    if already is None:
        consent = _grant(db, person, category, REGISTRATION_FORM)
        await _audit(db, "email_consent_granted", consent, "anonymous", None, request_id, via="confirmation_link")
    await db.commit()
    return category


# --- administrators: read the history, record an opt-out ------------------------------------------------


def consent_to_dict(consent: EmailConsent, category: EmailCategory) -> dict:
    return {
        "id": consent.id,
        "category_key": consent.category_key,
        "category_name": category.name_nl,
        "source": consent.source,
        "granted_at": consent.granted_at,
        "revoked_at": consent.revoked_at,
        "revoked_source": consent.revoked_source,
    }


async def list_person_consents(db: AsyncSession, person_id: str) -> list[dict]:
    rows = (
        await db.execute(
            select(EmailConsent, EmailCategory)
            .join(EmailCategory, EmailConsent.category_key == EmailCategory.key)
            .where(EmailConsent.person_id == person_id)
            .order_by(EmailConsent.granted_at.desc(), EmailConsent.id.desc())
        )
    ).all()
    return [consent_to_dict(consent, category) for consent, category in rows]


async def record_admin_opt_out(
    db: AsyncSession, person: Person, category_key: str, *, actor: str, request_id: str | None = None
) -> list[dict]:
    """End the person's open consent for a category and cancel a pending confirmation.

    Convergent: with nothing open it changes and audits nothing.
    """
    if await db.get(EmailCategory, category_key) is None:
        raise NotFoundError(f"Email category '{category_key}' not found.", code="email_category_not_found")
    now = datetime.now(UTC)
    open_rows = (
        await db.scalars(
            select(EmailConsent)
            .where(
                EmailConsent.person_id == person.id,
                EmailConsent.category_key == category_key,
                EmailConsent.revoked_at.is_(None),
            )
            .with_for_update()
        )
    ).all()
    for consent in open_rows:
        consent.revoked_at = now
        consent.revoked_source = ADMIN
        await _audit(db, "email_consent_revoked", consent, actor, None, request_id)
    await db.execute(
        delete(EmailConsentConfirmation).where(
            EmailConsentConfirmation.person_id == person.id, EmailConsentConfirmation.category_key == category_key
        )
    )
    await db.commit()
    return await list_person_consents(db, person.id)


# --- people lifecycle -----------------------------------------------------------------------------------


async def has_open_consent(db: AsyncSession, person_id: str) -> bool:
    """Whether any category consent is still active (anonymisation then keeps the address)."""
    return (
        await db.scalar(
            select(EmailConsent.id)
            .where(EmailConsent.person_id == person_id, EmailConsent.revoked_at.is_(None))
            .limit(1)
        )
        is not None
    )


async def drop_pending_confirmations(db: AsyncSession, person_id: str) -> None:
    await db.execute(delete(EmailConsentConfirmation).where(EmailConsentConfirmation.person_id == person_id))


async def cleanup_expired_confirmations(db: AsyncSession) -> int:
    """Delete confirmation requests past their deadline; run daily by ``python -m app.maintenance housekeeping``."""
    deleted = (
        await db.scalars(
            delete(EmailConsentConfirmation)
            .where(EmailConsentConfirmation.expires_at < datetime.now(UTC))
            .returning(EmailConsentConfirmation.id)
        )
    ).all()
    await db.commit()
    return len(deleted)


async def merge_consents(db: AsyncSession, canonical_id: str, duplicate_id: str, *, same_address: bool) -> None:
    """Move the duplicate's consent history to the surviving person.

    A category the survivor already has open keeps the survivor's record, and when the survivor's
    address differs from the one consent was given for nothing stays open: those open records are
    closed as ``merged`` and kept as history. Pending confirmations are dropped (the person can ask
    again).
    """
    await drop_pending_confirmations(db, duplicate_id)
    held = select(EmailConsent.category_key).where(
        EmailConsent.person_id == canonical_id, EmailConsent.revoked_at.is_(None)
    )
    superseded = EmailConsent.revoked_at.is_(None)
    if same_address:
        superseded = superseded & EmailConsent.category_key.in_(held)
    await db.execute(
        update(EmailConsent)
        .where(EmailConsent.person_id == duplicate_id, superseded)
        .values(revoked_at=datetime.now(UTC), revoked_source=MERGED)
    )
    await db.execute(update(EmailConsent).where(EmailConsent.person_id == duplicate_id).values(person_id=canonical_id))
