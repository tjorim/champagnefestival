"""Provider-neutral member-mail transport contract (#1407).

No audience lookup, consent grant, scheduling or network transport lives here.
Only a disabled adapter is available until the sending service is selected.
"""

from email.message import EmailMessage
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, EmailStr, HttpUrl, field_validator

from app.config import Settings, settings
from app.schema_types import NonEmptyText, ResourceKey


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
