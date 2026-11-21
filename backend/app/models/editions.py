"""Editions and the organizations taking part in them."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import _utcnow

if TYPE_CHECKING:
    from app.models.events import Event


class Edition(Base):
    """A festival edition or related standalone event container."""

    __tablename__ = "editions"
    __table_args__ = (
        Index(
            "uq_editions_active_type",
            "edition_type",
            unique=True,
            postgresql_where=text("active = true"),
            sqlite_where=text("active = true"),
        ),
        CheckConstraint("edition_type IN ('festival', 'bourse', 'capsule_exchange')", name="ck_editions_edition_type"),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    """Slug-style identifier, e.g. '2026-march'."""

    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[str] = mapped_column(String(20))

    venue_id: Mapped[str] = mapped_column(String(64), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False)
    edition_type: Mapped[str] = mapped_column(String(20), default="festival")
    lineup: Mapped[list[EditionOrganization]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="EditionOrganization.position",
    )
    """The festival lineup — producers and sponsors programmed for this edition, in the
    admin-defined order (kept: sponsors appear on the public site in this order within their
    tier, #1226). Sponsorship is per edition, so a sponsor's level lives on its lineup row
    rather than on the organization. Read and written through `organizations` and
    `sponsor_tiers`; see `app.services.editions_service`."""

    @property
    def organizations(self) -> list[int]:
        return [entry.organization_id for entry in self.lineup]

    @organizations.setter
    def organizations(self, organization_ids: list[int]) -> None:
        existing = {entry.organization_id: entry for entry in self.lineup}
        entries = []
        for position, organization_id in enumerate(dict.fromkeys(organization_ids)):
            entry = existing.get(organization_id) or EditionOrganization(organization_id=organization_id)
            entry.position = position
            entries.append(entry)
        self.lineup = entries

    @property
    def sponsor_tiers(self) -> dict[str, str]:
        """Sponsor level per lineup organization, ``{organization id (string): "main" | "partner" |
        "supporter"}``. Set `organizations` first: only lineup members can hold a level."""
        return {str(entry.organization_id): entry.sponsor_tier for entry in self.lineup if entry.sponsor_tier}

    @sponsor_tiers.setter
    def sponsor_tiers(self, tiers: dict[str, str]) -> None:
        for entry in self.lineup:
            entry.sponsor_tier = tiers.get(str(entry.organization_id))

    co_organizer_organization_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    """The organization co-organizing this edition with the vzw, if any.

    Deliberately separate from `organizations`: co-organizing is a different
    relationship from being in the lineup, and it applies to editions (such as a
    bourse) that carry no lineup at all. The vzw remains the organizer either way.
    """

    active: Mapped[bool] = mapped_column(Boolean, default=True)
    """At most one edition per `edition_type` may be active at a time — enforced by the
    `uq_editions_active_type` partial unique index (migration 009) and, on the normal
    single-request path, by `app.services.editions_service.deactivate_conflicting_editions`
    transactionally deactivating the previous active edition of the same type. See #832."""

    flyer_image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hero_image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    share_image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    """Optional admin-uploaded artwork (#1224): the flyer shown on the maintenance
    page, the wide hero photo and the 1200x630 sharing image (`og:image`, JSON-LD).
    Each holds a managed `/uploads/editions/<uuid>-<sha256>.jpg` path written only
    by `app.services.edition_artwork`; `None` falls back to the static site images."""

    scratchpad: Mapped[str] = mapped_column(Text, default="")
    """A free-text, deliberately unstructured planning notepad for this edition
    — reminders, ideas, anything an admin wants written down. Admin-only,
    never exposed through the public edition endpoints (``EditionPublicOut``
    excludes it) or the admin `EditionOut` list/detail shape; read/written
    only through the dedicated ``GET``/``PUT /api/editions/{id}/scratchpad``
    endpoints, so scratchpad edits don't force a refetch of the much heavier
    full edition payload."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    events: Mapped[list[Event]] = relationship(
        back_populates="edition",
        cascade="all, delete-orphan",
        order_by="Event.date, Event.start_time, Event.created_at",
    )


class EditionOrganization(Base):
    """One organization in an edition's lineup (see `Edition.lineup`)."""

    __tablename__ = "edition_organizations"
    __table_args__ = (
        CheckConstraint(
            "sponsor_tier IS NULL OR sponsor_tier IN ('main', 'partner', 'supporter')",
            name="ck_edition_organizations_sponsor_tier",
        ),
    )

    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), primary_key=True
    )
    organization_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    sponsor_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)
