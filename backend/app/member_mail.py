"""Provider-neutral member-mail transport contract (#1407).

No audience lookup, consent grant, scheduling or network transport lives here.
Only a disabled adapter is available until the sending service is selected.
"""

import logging
from email.message import EmailMessage
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, EmailStr, HttpUrl, field_validator

from app.config import Settings, settings
from app.schema_types import NonEmptyText, ResourceKey

logger = logging.getLogger(__name__)


class MemberMail(BaseModel):
    """One recipient's rendered snapshot, passed unchanged on reconciliation.

    The caller must check category consent, current roles and suppression first.
    unsubscribe_url must be a signed category-specific, login-free POST endpoint;
    URL validation here does not establish that authorization contract.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    delivery_key: ResourceKey
    category_key: ResourceKey
    recipient: EmailStr
    sender: EmailStr
    subject: NonEmptyText
    text: NonEmptyText
    unsubscribe_url: HttpUrl

    @field_validator("unsubscribe_url")
    @classmethod
    def validate_unsubscribe_url(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https" or value.username or value.password or value.fragment:
            raise ValueError("Member-mail unsubscribe URLs require HTTPS without credentials or a fragment.")
        return value

    @field_validator("subject")
    @classmethod
    def validate_subject(cls, value: str) -> str:
        if "\r" in value or "\n" in value:
            raise ValueError("Member-mail subjects must be a single line.")
        return value

    def as_message(self) -> EmailMessage:
        """Build plain-text MIME without accepting arbitrary headers or HTML."""
        message = EmailMessage()
        message["From"] = str(self.sender)
        message["To"] = str(self.recipient)
        message["Subject"] = self.subject
        message["List-Unsubscribe"] = f"<{self.unsubscribe_url}>"
        message["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        message.set_content(self.text)
        return message


class MemberMailResult(BaseModel):
    """Provider acceptance is not inbox delivery. Unknown outcomes need reconciliation.

    Adapters must map provider errors to these outcomes without exposing recipient
    addresses, unsubscribe tokens or raw provider responses in diagnostics.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    status: Literal["accepted", "rejected", "unknown", "disabled"]
    provider_message_id: str | None = None


class MemberMailProvider(Protocol):
    async def send(self, mail: MemberMail) -> MemberMailResult:
        """Submit once, using delivery_key as the provider idempotency key if supported.

        No implicit retries. A future adapter must document its deduplication
        window, rate limits and timeout reconciliation before outbox integration.
        """
        ...


class DisabledMemberMailProvider:
    async def send(self, mail: MemberMail) -> MemberMailResult:
        return MemberMailResult(status="disabled")


def get_member_mail_provider(config: Settings = settings) -> MemberMailProvider:
    """Fail closed even if settings were mutated without Pydantic validation."""
    if config.member_mail_provider != "disabled":
        raise ValueError("Unsupported member-mail provider.")
    return DisabledMemberMailProvider()


def member_mail_available(config: Settings = settings) -> bool:
    """Whether member mail can be sent at all: an adapter is selected and the bulk sender and the
    unsubscribe signing key are configured. Never true while only the disabled adapter exists."""
    return config.member_mail_provider != "disabled" and bool(
        config.member_mail_from and config.member_mail_signing_key
    )


class MemberMailNotSent(Exception):
    """Why a recipient's mail was not accepted. The outbox records the class name as the job's error
    code, so the subclasses double as the stable per-recipient outcome codes; messages never carry an
    address, token or provider response."""


class MemberMailSkipped(MemberMailNotSent):
    """The recipient was no longer eligible (consent withdrawn, role retired, address suppressed)."""


class MemberMailRejected(MemberMailNotSent):
    """The mail could not be built or the provider refused it."""


class MemberMailUncertain(MemberMailNotSent):
    """The provider's answer is unknown. The mail is never submitted again automatically."""


class MemberMailUnavailable(MemberMailNotSent):
    """Member mail is disabled or not configured."""


async def submit(mail: MemberMail) -> None:
    """Submit once through the configured provider; return only when it accepted the mail.

    Every other outcome raises a ``MemberMailNotSent`` subclass and nothing is retried here. Provider
    errors are logged by class only: their text may contain the recipient's address.
    """
    try:
        result = await get_member_mail_provider().send(mail)
    except Exception as exc:
        logger.warning("Member-mail provider error for delivery_key=%s: %s", mail.delivery_key, type(exc).__name__)
        raise MemberMailUncertain("The provider did not answer.") from None
    match result.status:
        case "accepted":
            return
        case "rejected":
            raise MemberMailRejected("The provider refused the mail.")
        case "disabled":
            raise MemberMailUnavailable("Member mail is disabled.")
        case _:
            raise MemberMailUncertain("The provider's answer is unknown.")
