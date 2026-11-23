"""People (contact records, members and volunteers)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, Index, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.vocabularies import Locale
from app.db.base import Base
from app.db.dialect_functions import trim_spaces
from app.models.base import _utcnow
from app.models.vocabulary import vocabulary_check

if TYPE_CHECKING:
    from app.models.registrations import Registration


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
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    retired_roles: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    """Roles the person has stepped back from, as ``{role: ISO retirement date}``. A retired role
    stays in ``roles`` (with every registration and help period) but the person no longer counts
    as an active member or volunteer; ``anonymised`` is the separate, person-wide marker.
    Derived from ``role_history`` and written only by ``app.services.role_history``."""
    role_history: Mapped[dict[str, list[dict[str, str | None]]]] = mapped_column(JSON, default=dict)
    """When each role was held: ``{role: [{"started_on", "ended_on"}, ...]}`` (ISO days, oldest
    first; no ``ended_on`` means in progress, a null ``started_on`` means unknown). See
    ``app.services.role_history``."""

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

    oidc_subject: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    """The `sub` claim of the OIDC-authenticated volunteer this Person record
    is linked to, if any — established by the volunteer themselves via
    `POST /api/me/volunteer/register` (which creates this Person row from
    their submitted name/NISS/eID, or links to a pre-existing unlinked exact
    match) or set directly by an admin. Unlike `Person.roles`, this is
    independent of the OIDC `volunteer`/`admin` realm role used by
    `require_volunteer` for event-day access — it identifies *which* Person a
    token belongs to, not *whether* the token may act as a volunteer. See
    docs/decisions/1006-volunteer-identity-self-service.md."""
    visits_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    anonymised: Mapped[bool] = mapped_column(Boolean, default=False)
    """Set when the record has been anonymised (``people_service.anonymise_person``); such a person
    counts as inactive in every role and is not offered for anonymisation again."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    registrations: Mapped[list[Registration]] = relationship(back_populates="person")


Index(
    "uq_people_current_member_email",
    func.lower(trim_spaces(Person.email)),
    unique=True,
    postgresql_where=text(
        "NOT anonymised AND CAST(roles AS text) LIKE '%\"member\"%' AND retired_roles ->> 'member' IS NULL AND trim(email) <> ''"
    ),
    sqlite_where=text(
        "NOT anonymised AND CAST(roles AS text) LIKE '%\"member\"%' AND json_extract(retired_roles, '$.member') IS NULL AND trim(email) <> ''"
    ),
)
