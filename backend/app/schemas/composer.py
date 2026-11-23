"""The central message composer."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field, ValidationInfo, field_validator, model_validator

from app.schemas.actors import ActorLabel
from app.schemas.announcements import AnnouncementLevel, _validate_safe_announcement_url
from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import ResourceKey, Text500, Text1000
from app.services.composer_content import LOCALES, build_composer_payload, pick_locale_text

ComposedMessageChannel = Literal["announcement", "push", "email"]


ComposedMessageToolChannel = Literal["announcement", "push"]
"""Channels the MCP tools offer: member mail (#1407) is composed and sent from the admin only."""


ComposedMessageState = Literal["draft", "scheduled", "sent"]


class _ComposedMessageFields[
    LevelT: AnnouncementLevel | None,
    ChannelsT: list[ComposedMessageChannel] | None,
](RequestModel):
    """Title and body per language (#1222): Dutch must have both, the others are
    optional, and a language is used only when both its title and body have text
    (otherwise the Dutch text is delivered)."""

    title_nl: Text500 | None = None
    title_fr: Text500 | None = None
    title_en: Text500 | None = None
    body_nl: Text500 | None = None
    body_fr: Text500 | None = None
    body_en: Text500 | None = None
    level: LevelT
    channels: ChannelsT
    link_url: Text1000 | None = None
    email_category_key: ResourceKey | None = None
    """Audience of the ``email`` channel (#1407); set exactly when ``email`` is a channel."""

    _safe_link_url = field_validator("link_url")(_validate_safe_announcement_url)

    @field_validator("title_nl", "title_fr", "title_en", "body_nl", "body_fr", "body_en", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("channels")
    @classmethod
    def no_duplicate_channels(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("channels must not contain duplicates")
        return value


class ComposedMessageFields(_ComposedMessageFields[AnnouncementLevel | None, list[ComposedMessageChannel] | None]):
    """Title and body per language (#1222): Dutch must have both, the others are
    optional, and a language is used only when both its title and body have text
    (otherwise the Dutch text is delivered)."""

    level: AnnouncementLevel | None = None
    channels: list[ComposedMessageChannel] | None = Field(default=None, min_length=1)


class ComposedMessageWrite(_ComposedMessageFields[AnnouncementLevel, list[ComposedMessageChannel]]):
    """The complete, validated state of a composed message (create body, and what an update merges into)."""

    level: AnnouncementLevel = "info"
    channels: list[ComposedMessageChannel] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_composed_message(self):
        if not self.title_nl or not self.body_nl:
            raise ValueError("a composed message needs a Dutch title and a Dutch body")
        if ("email" in self.channels) != (self.email_category_key is not None):
            raise ValueError("email_category_key is required for the email channel, and only valid with it")
        if "push" in self.channels:
            for locale in LOCALES:
                text = pick_locale_text(self, locale)
                if text is not None:
                    build_composer_payload(*text)
        return self


class ComposedMessageCreate(ComposedMessageWrite):
    pass


class ComposedMessageUpdate(ComposedMessageFields):
    """Only valid while the message is still ``draft`` — see
    ``app.services.composer_service.update_draft``."""


class ComposedMessageOut(ResponseModel):
    id: str
    title_nl: str | None
    title_fr: str | None
    title_en: str | None
    body_nl: str | None
    body_fr: str | None
    body_en: str | None
    level: AnnouncementLevel
    channels: list[str]
    link_url: str | None
    email_category_key: str | None
    state: ComposedMessageState
    scheduled_at: datetime | None
    announcement_id: str | None
    push_audience_snapshot: list[str] | None
    email_audience_snapshot: list[str] | None
    sent_at: datetime | None
    sent_by: str | None
    actor_label: ActorLabel | None
    created_at: datetime
    updated_at: datetime
    estimated_push_audience: int
    """Current opted-in push subscriber count — an estimate shown before
    confirmation, not the immutable snapshot (``push_audience_snapshot``,
    only set once ``state == "sent"``). Resolved fresh on every read."""
    push_delivered_count: int
    push_failed_count: int
    push_pending_count: int
    """Aggregate outcome counts for this message's push delivery jobs — all
    zero until ``state == "sent"``. Never exposes a subscription's endpoint
    or keys, only counts (acceptance criterion: "per-channel results are
    visible without exposing secrets")."""
    estimated_email_audience: int
    """People who would be mailed now for ``email_category_key`` (consent, role, address, not
    suppressed); 0 without the email channel. An estimate: each recipient is checked again when
    their mail is submitted."""
    email_accepted_count: int
    email_failed_count: int
    email_skipped_count: int
    email_pending_count: int
    """Counts of this message's email jobs, zero until ``state == "sent"``. *Accepted* means the
    sending service took the mail, not that it reached an inbox; a mail whose outcome was uncertain
    counts as failed and is never submitted again. *Skipped* recipients were no longer eligible when
    their turn came (consent withdrawn, role retired, address suppressed)."""
    member_mail_available: bool
    """Whether member mail is configured. Without it the email channel is refused at scheduling, so
    the admin screen can say so before offering the final action (#1432)."""

    model_config = ConfigDict(from_attributes=True)


class MemberMailUnsubscribeCategoryOut(ResponseModel):
    category_key: str
    category_name: str


class ComposedMessageScheduleRequest(RequestModel):
    scheduled_at: datetime | None = None
    """``None`` sends as soon as the worker next polls (#947) — "publish now"
    is "schedule for right now", not a separate code path."""
    expected_email_audience: int | None = Field(default=None, ge=0)
    """The ``estimated_email_audience`` the administrator confirmed (#1407). Required for the email
    channel; a different current count is refused so nobody mails a list they did not see."""
    expected_updated_at: datetime | None = None
    """The ``updated_at`` of the saved message the administrator reviewed (#1432). When given, a
    message saved since then is refused (``composed_message_changed``) so the reviewed text is what
    goes out. Optional so existing callers (the MCP tool) keep working."""

    @field_validator("scheduled_at", "expected_updated_at")
    @classmethod
    def timezone_required(cls, value: datetime | None, info: ValidationInfo) -> datetime | None:
        if value and value.utcoffset() is None:
            raise ValueError(f"{info.field_name} must include a timezone")
        return value
