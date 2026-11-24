"""People (contact records, members and volunteers)."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.vocabularies import DirectoryRole, Locale
from app.db.base import Base
from app.models.base import _utcnow
from app.models.vocabulary import vocabulary_check

if TYPE_CHECKING:
    from app.models.registrations import Registration
    from app.models.users import User


class Person(Base):
    """Unified person entity used for members, volunteers, and visitors."""

    __tablename__ = "people"
    __table_args__ = (
        vocabulary_check("ck_people_preferred_language", "preferred_language", Locale),
        # Trigram (pg_trgm) GIN indexes backing fuzzy operational search, in
        # addition to the plain btree index=True below on search_email — the
        # migration creates both, since exact-match lookup and fuzzy search
        # need different index shapes on the same column.
        Index(
            "ix_people_search_name_trgm",
            "search_name",
            postgresql_using="gin",
            postgresql_ops={"search_name": "gin_trgm_ops"},
        ),
        Index(
            "ix_people_search_name_alt_trgm",
            "search_name_alt",
            postgresql_using="gin",
            postgresql_ops={"search_name_alt": "gin_trgm_ops"},
        ),
        Index(
            "ix_people_search_email_trgm",
            "search_email",
            postgresql_using="gin",
            postgresql_ops={"search_email": "gin_trgm_ops"},
        ),
        # One composite btree per sortable column of the paged people lists
        # (app.services.people_listing), each ending in the id tiebreak so the
        # index serves the full ORDER BY in either direction. Name and email
        # sort on the normalised search_* columns. (search_email is also
        # covered on its own by the plain index above.)
        Index("ix_people_search_name_id", "search_name", "id"),
        Index("ix_people_search_email_id", "search_email", "id"),
        Index("ix_people_created_at_id", "created_at", "id"),
        Index("ix_people_updated_at_id", "updated_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), default="")
    preferred_language: Mapped[str | None] = mapped_column(String(2), nullable=True)
    search_name: Mapped[str] = mapped_column(String(200), default="")
    """Trigger-maintained unaccented lower-case name for operational lookup."""
    search_name_alt: Mapped[str] = mapped_column(String(200), default="")
    """Trigger-maintained German-transliteration variant for operational lookup."""
    search_email: Mapped[str] = mapped_column(String(320), default="", index=True)
    """Trigger-maintained lower-case email for authorized operational lookup."""
    phone: Mapped[str] = mapped_column(String(50), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    role_periods: Mapped[list[PersonRolePeriod]] = relationship(
        lazy="selectin", order_by="PersonRolePeriod.position", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def latest_role_periods(self) -> dict[str, PersonRolePeriod]:
        return {period.role: period for period in self.role_periods}

    @property
    def roles(self) -> list[str]:
        return sorted(role for role, period in self.latest_role_periods.items() if not period.removed)

    @property
    def retired_roles(self) -> dict[str, str]:
        return {
            role: period.ended_on.isoformat()
            for role, period in self.latest_role_periods.items()
            if not period.removed and period.ended_on is not None
        }

    @property
    def role_history(self) -> dict[str, list[dict[str, str | None]]]:
        history: dict[str, list[dict[str, str | None]]] = {}
        for period in self.role_periods:
            history.setdefault(period.role, []).append(
                {
                    "started_on": period.started_on.isoformat() if period.started_on else None,
                    "ended_on": period.ended_on.isoformat() if period.ended_on else None,
                }
            )
        return history

    inactivity_exempt: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    inactivity_exempt_note: Mapped[str] = mapped_column(Text, default="", server_default="")

    national_register_number: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    """Belgium's National Register Number (NISS) — fixed and lifelong; this is
    what would be used to re-identify the person later. Volunteer-only (see
    docs/decisions/934-data-retention-and-erasure.md)."""
    eid_document_number: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    """The physical eID card's own document number, captured once at volunteer
    sign-up to support an insurance claim referencing that specific document.
    A point-in-time record, not a live one: the card (and this number) is
    typically renewed or replaced every 5-10 years, and nothing here
    re-verifies or re-prompts for an update when that happens — a volunteer
    can flag a renewal themselves via `POST /api/me/volunteer/eid-correction`
    (see `oidc_subject` below and docs/decisions/1006-volunteer-identity-self-service.md)."""

    user_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True
    )
    """The portal account proven to own this person, if any (#1655). Set only through
    ``app.services.person_account`` — from a verified OIDC subject (volunteer self-registration or an
    admin link) or a verified-email match against an unambiguous, unlinked record — and unique, so
    one account answers for at most one person and one person for at most one account. Independent of
    the OIDC ``volunteer``/``admin`` realm roles used by ``require_volunteer``: it identifies *which*
    person an account is, not *whether* the account may act as a volunteer. See
    docs/decisions/1006-volunteer-identity-self-service.md and docs/authorization-model.md."""
    user: Mapped[User | None] = relationship(lazy="selectin")

    @property
    def oidc_subject(self) -> str | None:
        """The linked account's OIDC ``sub`` (read-only view; link through ``person_account``)."""
        return self.user.oidc_subject if self.user is not None else None

    notes: Mapped[str] = mapped_column(Text, default="")
    anonymised: Mapped[bool] = mapped_column(Boolean, default=False)
    """Set when the record has been anonymised (``people_service.anonymise_person``); such a person
    counts as inactive in every role and is not offered for anonymisation again."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    registrations: Mapped[list[Registration]] = relationship(back_populates="person")


class PersonRolePeriod(Base):
    __tablename__ = "person_role_periods"
    __table_args__ = (
        vocabulary_check("ck_person_role_periods_role", "role", DirectoryRole),
        CheckConstraint("NOT removed OR ended_on IS NOT NULL", name="ck_person_role_periods_removed"),
        Index("ix_person_role_periods_role_person", "role", "person_id"),
        Index(
            "uq_person_role_periods_open",
            "person_id",
            "role",
            unique=True,
            postgresql_where=text("ended_on IS NULL"),
            sqlite_where=text("ended_on IS NULL"),
        ),
    )

    person_id: Mapped[str] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    started_on: Mapped[date | None] = mapped_column(Date)
    ended_on: Mapped[date | None] = mapped_column(Date)
    removed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    """An explicit removal from the directory, as distinct from retirement."""

    member_email: Mapped[str | None] = mapped_column(String(320))
    """Trigger-maintained index key for open, non-anonymised memberships with an email."""


Index("uq_people_current_member_email", func.lower(PersonRolePeriod.member_email), unique=True)
