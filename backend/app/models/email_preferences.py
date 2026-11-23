"""Email suppression, categories and consent."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.translations import resolve_text
from app.core.vocabularies import ConsentRevocationSource, ConsentSource, SuppressionReason
from app.db.base import Base
from app.models.base import _optional_dutch_check, _utcnow
from app.models.vocabulary import vocabulary_check


class EmailSuppression(Base):
    """An address that member mail must never be sent to again (#1407).

    Only a hash of the normalised address is kept: enough to refuse the address, and nothing to erase
    with a person. Filled from the sending service's verified bounce and complaint feedback once a
    service is chosen; an entry is never removed automatically.
    """

    __tablename__ = "email_suppressions"
    __table_args__ = (vocabulary_check("ck_email_suppressions_reason", "reason", SuppressionReason),)

    address_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    reason: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class EmailCategory(Base):
    """A kind of email a person can consent to receive (#1408).

    The key is the stable identity consent records point at. ``allowed_roles`` lists the roles that
    may use the category (empty means everyone); a role is checked when consent is given and again at
    send time. ``automatic`` marks categories whose mail is triggered by application code; it is set
    only for the seeded defaults, so editing a category never adds a sending capability.
    """

    __tablename__ = "email_categories"
    __table_args__ = (
        CheckConstraint("(length(trim(name_nl)) > 0) IS TRUE", name="ck_email_categories_name_nl"),
        CheckConstraint(_optional_dutch_check("description"), name="ck_email_categories_description_nl"),
    )

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    name_nl: Mapped[str] = mapped_column(String(100))
    name_fr: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name_en: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    allowed_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    automatic: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized_name(self, locale: str | None) -> str:
        return resolve_text({"nl": self.name_nl, "fr": self.name_fr, "en": self.name_en}, locale)

    def localized_description(self, locale: str | None) -> str | None:
        return (
            resolve_text({"nl": self.description_nl, "fr": self.description_fr, "en": self.description_en}, locale)
            or None
        )


class EmailConsent(Base):
    """One grant of consent by a person for an email category, and how it ended (#1408).

    A grant is written only by the person themselves (the signed-in preferences screen, or the
    confirmation link of the registration form). Withdrawing sets ``revoked_at``; a new grant after
    that is a new row, so the history of grants and withdrawals survives. At most one grant per
    person and category is open at a time.
    """

    __tablename__ = "email_consents"
    __table_args__ = (
        vocabulary_check("ck_email_consents_source", "source", ConsentSource),
        vocabulary_check("ck_email_consents_revoked_source", "revoked_source", ConsentRevocationSource),
        CheckConstraint("(revoked_at IS NULL) = (revoked_source IS NULL)", name="ck_email_consents_revocation"),
        Index(
            "uq_email_consents_open",
            "person_id",
            "category_key",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
            sqlite_where=text("revoked_at IS NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), index=True)
    category_key: Mapped[str] = mapped_column(ForeignKey("email_categories.key", ondelete="RESTRICT"), index=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    source: Mapped[ConsentSource] = mapped_column(String(30))
    """``self_service`` (preferences screen) or ``registration_form`` (confirmed through the emailed link)."""
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_source: Mapped[ConsentRevocationSource | None] = mapped_column(String(30), nullable=True)
    """``self_service``, ``admin`` (an administrator recorded an opt-out) or ``merged`` (superseded by the
    surviving person's own open grant when two people were merged)."""


class EmailConsentConfirmation(Base):
    """A pending, emailed request to activate consent for an address nobody has verified yet (#1408).

    Created when the registration form's updates option is ticked without a verified email for the
    person. Only the token hash is stored; opening the link activates the consent and removes the row.
    """

    __tablename__ = "email_consent_confirmations"
    __table_args__ = (UniqueConstraint("person_id", "category_key", name="uq_email_consent_confirmation"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), index=True)
    category_key: Mapped[str] = mapped_column(ForeignKey("email_categories.key", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
