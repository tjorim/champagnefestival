"""Who a member mailing may reach (#1407, built on the consent of #1408).

A person is mailed for a category only while all of this holds: an open consent for it, a role the
category needs that is not retired, a non-anonymised record, an address, and an address that is not
suppressed. The audience is resolved once at dispatch and frozen as person ids; each recipient is
checked again with :func:`eligible_person` just before their mail is submitted.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EmailCategory, EmailConsent, Person
from app.services.email_categories_service import person_allows
from app.services.email_consent_service import normalise_email
from app.services.email_suppression_service import address_hash, suppressed_hashes


async def eligible_people(db: AsyncSession, category: EmailCategory) -> list[Person]:
    """People to mail for *category* now, one per address, oldest record first.

    Several people can share an address; only one of them receives the mail.
    """
    people = list(
        (
            await db.scalars(
                select(Person)
                .join(EmailConsent, EmailConsent.person_id == Person.id)
                .where(EmailConsent.category_key == category.key, EmailConsent.revoked_at.is_(None))
                .order_by(Person.created_at, Person.id)
            )
        ).all()
    )
    candidates = [p for p in people if normalise_email(p.email) and person_allows(p, category)]
    suppressed = await suppressed_hashes(db, [p.email for p in candidates])
    chosen: dict[str, Person] = {}
    for person in candidates:
        digest = address_hash(person.email)
        if digest not in suppressed:
            chosen.setdefault(digest, person)
    return list(chosen.values())


async def eligible_person(db: AsyncSession, person_id: str, category: EmailCategory) -> Person | None:
    """The person when they may still be mailed for *category*, otherwise ``None``."""
    person = await db.get(Person, person_id)
    if person is None or not normalise_email(person.email) or not person_allows(person, category):
        return None
    open_consent = await db.scalar(
        select(EmailConsent.id)
        .where(
            EmailConsent.person_id == person.id,
            EmailConsent.category_key == category.key,
            EmailConsent.revoked_at.is_(None),
        )
        .limit(1)
    )
    if open_consent is None or await suppressed_hashes(db, [person.email]):
        return None
    return person
