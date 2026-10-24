"""Login-free, category-scoped unsubscribe links for member mail (#1407).

A link is ``base64url(person_id NL category_key) "." HMAC-SHA256`` under
``MEMBER_MAIL_SIGNING_KEY``. It carries no expiry: a mail may be opened months later and withdrawing
consent is harmless and convergent. It authorises exactly one thing, ending consent for that
category at the person's address; it never signs anyone in. Rotating the key invalidates every link
already mailed.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
from datetime import UTC, datetime
from urllib.parse import quote

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, settings
from app.models import EmailCategory, EmailConsent, EmailConsentConfirmation, Person
from app.services.email_consent_service import _audit, people_for_email
from app.services.errors import ServiceError

UNSUBSCRIBE_LINK = "unsubscribe_link"
UNSUBSCRIBE_PATH = "/api/mail/unsubscribe"
_CONTEXT = b"member-mail-unsubscribe-v1\n"


def _invalid() -> ServiceError:
    return ServiceError("This unsubscribe link is not valid.", status_code=404, code="unsubscribe_token_invalid")


def _signature(payload: bytes, key: str) -> str:
    return hmac.new(key.encode("utf-8"), _CONTEXT + payload, hashlib.sha256).hexdigest()


def make_unsubscribe_token(person_id: str, category_key: str, config: Settings = settings) -> str:
    if not config.member_mail_signing_key:
        raise RuntimeError("MEMBER_MAIL_SIGNING_KEY is not configured.")
    payload = f"{person_id}\n{category_key}".encode()
    encoded = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    return f"{encoded}.{_signature(payload, config.member_mail_signing_key)}"


def unsubscribe_url(person_id: str, category_key: str, config: Settings = settings) -> str:
    token = make_unsubscribe_token(person_id, category_key, config)
    return f"{config.frontend_url.rstrip('/')}{UNSUBSCRIBE_PATH}?token={quote(token, safe='')}"


def unsubscribe_page_url(person_id: str, category_key: str, config: Settings = settings) -> str:
    """The visible footer link: the frontend page that asks before unsubscribing, so a mail scanner
    following it changes nothing."""
    token = make_unsubscribe_token(person_id, category_key, config)
    return f"{config.frontend_url.rstrip('/')}/email-unsubscribe?token={quote(token, safe='')}"


def read_unsubscribe_token(token: str, config: Settings = settings) -> tuple[str, str]:
    """The ``(person_id, category_key)`` a valid token authorises; anything else is a 404."""
    if not config.member_mail_signing_key:
        raise _invalid()
    encoded, _, signature = token.partition(".")
    try:
        payload = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        person_id, category_key = payload.decode("utf-8").split("\n")
    except binascii.Error, ValueError:
        raise _invalid() from None
    # Compare bytes: compare_digest raises TypeError for a non-ASCII str, and the signature is caller input.
    expected = _signature(payload, config.member_mail_signing_key).encode("ascii")
    if not hmac.compare_digest(signature.encode("utf-8"), expected):
        raise _invalid()
    return person_id, category_key


async def unsubscribe(db: AsyncSession, token: str, *, request_id: str | None = None) -> None:
    """End the open consent for the token's category at the person's address.

    Every person sharing the address is covered, like withdrawing in the preferences. Convergent:
    a repeat, or a person who has since been deleted, changes nothing and still succeeds.
    """
    person_id, category_key = read_unsubscribe_token(token)
    person = await db.get(Person, person_id)
    if person is None:
        return
    people = await people_for_email(db, person.email, lock=True) if person.email.strip() else [person]
    ids = [candidate.id for candidate in people]
    open_rows = (
        await db.scalars(
            select(EmailConsent)
            .where(
                EmailConsent.person_id.in_(ids),
                EmailConsent.category_key == category_key,
                EmailConsent.revoked_at.is_(None),
            )
            .with_for_update()
        )
    ).all()
    now = datetime.now(UTC)
    for consent in open_rows:
        consent.revoked_at = now
        consent.revoked_source = UNSUBSCRIBE_LINK
        await _audit(db, "email_consent_revoked", consent, "anonymous", None, request_id, via="unsubscribe_link")
    await db.execute(
        delete(EmailConsentConfirmation).where(
            EmailConsentConfirmation.person_id.in_(ids), EmailConsentConfirmation.category_key == category_key
        )
    )
    await db.commit()


async def token_category(db: AsyncSession, token: str) -> EmailCategory:
    """The category a valid token unsubscribes from (a 404 for an invalid token or a removed category)."""
    _, category_key = read_unsubscribe_token(token)
    category = await db.get(EmailCategory, category_key)
    if category is None:
        raise _invalid()
    return category
