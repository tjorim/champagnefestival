"""Policies and their versions."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.translations import BASE_LANGUAGE, resolve_text
from app.core.vocabularies import PolicyVersionStatus
from app.db.base import Base
from app.models.base import _utcnow
from app.models.vocabulary import vocabulary_check


class Policy(Base):
    """A versioned legal/policy document identified by a stable key (e.g. ``privacy``).

    The title is mutable chrome, not content — it lives here rather than on
    ``PolicyVersion`` because only published *content* needs to be immutable.
    Like other translated content it must have a Dutch title; the other languages
    are optional and visitors fall back to Dutch.
    """

    __tablename__ = "policies"
    __table_args__ = (CheckConstraint("(length(trim(title_nl)) > 0) IS TRUE", name="ck_policies_title_nl"),)

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    title_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    title_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def localized_title(self, locale: str | None) -> str:
        return resolve_text({"nl": self.title_nl, "fr": self.title_fr, "en": self.title_en}, locale)

    versions: Mapped[list[PolicyVersion]] = relationship(
        back_populates="policy", order_by="PolicyVersion.version_number"
    )


class PolicyVersion(Base):
    """One revision of a policy's content.

    ``draft`` versions are freely editable. Publishing flips a draft to
    ``published`` and, in the same transaction, flips the previously-current
    ``published`` row to ``superseded`` — so at most one row per policy is ever
    ``published`` (enforced by the partial unique index below) and superseded/
    published rows are never mutated or deleted again. Rollback reuses the same
    draft-then-publish path: a new draft is seeded from an older version's
    content and published like any other draft, which is what gives it a new
    ``version_number`` and audit trail rather than resurrecting the old row.
    """

    __tablename__ = "policy_versions"
    __table_args__ = (
        UniqueConstraint("policy_key", "version_number", name="uq_policy_versions_number"),
        vocabulary_check("ck_policy_versions_status", "status", PolicyVersionStatus),
        CheckConstraint(
            "(status = 'draft' OR length(trim(content_nl)) > 0) IS TRUE",
            name="ck_policy_versions_nl",
        ),
        Index(
            "uq_policy_versions_one_draft",
            "policy_key",
            unique=True,
            postgresql_where=text("status = 'draft'"),
            sqlite_where=text("status = 'draft'"),
        ),
        Index(
            "uq_policy_versions_one_published",
            "policy_key",
            unique=True,
            postgresql_where=text("status = 'published'"),
            sqlite_where=text("status = 'published'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    policy_key: Mapped[str] = mapped_column(String(64), ForeignKey("policies.key"))
    version_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12), default="draft")
    content_nl: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_fr: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    created_by: Mapped[str] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    policy: Mapped[Policy] = relationship(back_populates="versions")

    def localized_content(self, locale: str | None) -> tuple[str, str]:
        """The (content, language it is written in) for *locale*, falling back to Dutch."""
        values = {"nl": self.content_nl, "fr": self.content_fr, "en": self.content_en}
        for language in (locale, BASE_LANGUAGE):
            if language and (values.get(language) or "").strip():
                return values[language] or "", language
        return "", BASE_LANGUAGE
