"""Addresses member mail must never reach again (#1407).

Entries come from the sending service's verified hard-bounce and complaint feedback; the feedback
receiver is not implemented until a service is chosen. Only a hash of the normalised address is
stored, so nothing here needs erasing with a person, and an address that was suppressed stays
refused even after the person who held it is deleted.
"""

from __future__ import annotations

import hashlib
from collections.abc import Collection
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EmailSuppression
from app.services.email_consent_service import normalise_email

HARD_BOUNCE = "hard_bounce"
COMPLAINT = "complaint"


def address_hash(email: str) -> str:
    return hashlib.sha256(normalise_email(email).encode("utf-8")).hexdigest()


async def suppressed_hashes(db: AsyncSession, emails: Collection[str]) -> set[str]:
    """The hashes among *emails* that are suppressed."""
    hashes = {address_hash(email) for email in emails if normalise_email(email)}
    if not hashes:
        return set()
    return set(
        (await db.scalars(select(EmailSuppression.address_hash).where(EmailSuppression.address_hash.in_(hashes)))).all()
    )


async def is_suppressed(db: AsyncSession, email: str) -> bool:
    return address_hash(email) in await suppressed_hashes(db, [email])


async def suppress(db: AsyncSession, email: str, reason: str) -> None:
    """Add the address; the first reason is kept. Convergent, so repeated feedback is harmless.

    The caller commits.
    """
    if not normalise_email(email):
        return
    digest = address_hash(email)
    if await db.get(EmailSuppression, digest) is None:
        db.add(EmailSuppression(address_hash=digest, reason=reason, created_at=datetime.now(UTC)))
