"""Digital signage channels, templates, slides and video exports."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.vocabularies import Locale, SlideKind, VideoExportProfile, VideoExportState
from app.db.base import Base
from app.models.base import _utcnow
from app.models.vocabulary import vocabulary_check


class SignageChannel(Base):
    """An explicitly edition-scoped public screen playlist with a fixed clock origin."""

    __tablename__ = "signage_channels"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    edition_id: Mapped[str] = mapped_column(ForeignKey("editions.id", ondelete="RESTRICT"))
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    epoch: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class SignageTemplate(Base):
    """Validated canvas document, shared between channels."""

    __tablename__ = "signage_templates"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    background: Mapped[dict] = mapped_column(JSON)
    layers: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class SignageSlide(Base):
    __tablename__ = "signage_slides"
    __table_args__ = (
        CheckConstraint("duration > 0 AND duration <= 3600", name="ck_signage_duration"),
        vocabulary_check("ck_signage_kind", "kind", SlideKind),
        CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="ck_signage_window"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    channel_id: Mapped[str] = mapped_column(ForeignKey("signage_channels.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[str] = mapped_column(ForeignKey("signage_templates.id", ondelete="RESTRICT"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(20))
    duration: Mapped[int] = mapped_column(Integer, default=10)
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class SignageVideoExport(Base):
    """Private, creator-owned frozen exports; retry identities outlive worker tombstones."""

    __tablename__ = "signage_video_exports"
    __table_args__ = (
        vocabulary_check("ck_signage_video_exports_state", "state", VideoExportState),
        vocabulary_check("ck_signage_video_exports_profile", "profile", VideoExportProfile),
        vocabulary_check("ck_signage_video_exports_locale", "locale", Locale),
        UniqueConstraint("creator", "idempotency_key", name="uq_signage_video_creator_key"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    creator: Mapped[str] = mapped_column(String(255), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128))
    channel_id: Mapped[str | None] = mapped_column(ForeignKey("signage_channels.id", ondelete="SET NULL"), index=True)
    channel_name: Mapped[str] = mapped_column(String(200))
    locale: Mapped[str] = mapped_column(String(2))
    snapshot: Mapped[dict] = mapped_column(JSON)
    profile: Mapped[str] = mapped_column(String(40), default=VideoExportProfile.SLIDESHOW_V1)
    uploads: Mapped[dict] = mapped_column(JSON, default=dict)
    payload_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    state: Mapped[str] = mapped_column(String(20), default=VideoExportState.PREPARING, index=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    local_cleaned: Mapped[bool] = mapped_column(Boolean, default=False)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    artifact: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
