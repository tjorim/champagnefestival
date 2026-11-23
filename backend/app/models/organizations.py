"""Organizations and their change requests."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.vocabularies import AuditSource, OrganizationChangeStatus, OrganizationType
from app.db.base import Base
from app.models.base import _optional_dutch_check, _utcnow
from app.models.vocabulary import vocabulary_check


class Organization(Base):
    """A unified organization: champagne producer, sponsor, or vendor."""

    __tablename__ = "organizations"

    __table_args__ = (
        vocabulary_check("ck_organizations_type", "type", OrganizationType),
        CheckConstraint(_optional_dutch_check("description"), name="ck_organizations_description_nl"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    image: Mapped[str] = mapped_column(String(500), default="")
    website: Mapped[str] = mapped_column(String(500), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    type: Mapped[str] = mapped_column(String(20), default=OrganizationType.VENDOR)
    """'producer' | 'sponsor' | 'vendor'"""
    contact_person_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("people.id", ondelete="SET NULL"), nullable=True
    )

    description_nl: Mapped[str | None] = mapped_column(String(600), nullable=True)
    description_fr: Mapped[str | None] = mapped_column(String(600), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(600), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class OrganizationChange(Base):
    """Private proposal history; the partial unique index permits one pending proposal."""

    __tablename__ = "organization_changes"
    __table_args__ = (
        Index(
            "uq_organization_pending_change",
            "organization_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
        vocabulary_check("ck_organization_changes_submitted_auth_source", "submitted_auth_source", AuditSource),
        vocabulary_check("ck_organization_change_status", "status", OrganizationChangeStatus),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    submitted_by: Mapped[str] = mapped_column(String(255))
    submitted_auth_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    submitted_values: Mapped[dict] = mapped_column(JSON)
    proposed: Mapped[dict] = mapped_column(JSON)
    superseded_fields: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reason: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    notification_recipient: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
