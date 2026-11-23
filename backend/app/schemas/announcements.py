"""Site announcements."""

from __future__ import annotations

from datetime import datetime
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator

from app.core.vocabularies import AnnouncementLevel
from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import Text120, Text500, Text1000


def _validate_safe_announcement_url(value: str | None) -> str | None:
    """Accept only absolute HTTPS announcement links without embedded credentials."""
    if value is None:
        return None
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("link_url must be a safe HTTPS URL without credentials")
    return value


_BLANK_TO_NONE = ("text_nl", "text_fr", "text_en", "link_label_nl", "link_label_fr", "link_label_en")


class _AnnouncementFields[LevelT: AnnouncementLevel | None, ActiveT: bool | None](RequestModel):
    """Announcement text and link label per language (#1222): Dutch must have the
    text (and the link label when there is a link), the others are optional
    translations, and visitors fall back to Dutch."""

    text_nl: Text500 | None = None
    text_fr: Text500 | None = None
    text_en: Text500 | None = None
    level: LevelT
    active: ActiveT
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    link_url: Text1000 | None = None
    link_label_nl: Text120 | None = None
    link_label_fr: Text120 | None = None
    link_label_en: Text120 | None = None

    _safe_link_url = field_validator("link_url")(_validate_safe_announcement_url)

    @field_validator(*_BLANK_TO_NONE, mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("starts_at", "ends_at")
    @classmethod
    def timezone_required(cls, value: datetime | None) -> datetime | None:
        if value and value.utcoffset() is None:
            raise ValueError("announcement timestamps must include a timezone")
        return value


class AnnouncementFields(_AnnouncementFields[AnnouncementLevel | None, bool | None]):
    """Announcement text and link label per language (#1222): Dutch must have the
    text (and the link label when there is a link), the others are optional
    translations, and visitors fall back to Dutch."""

    level: AnnouncementLevel | None = None
    active: bool | None = None


class AnnouncementWrite(_AnnouncementFields[AnnouncementLevel, bool]):
    """The complete, validated state of an announcement (create body, and what an update merges into)."""

    level: AnnouncementLevel = "info"
    active: bool = False

    @model_validator(mode="after")
    def validate_announcement(self):
        if not self.text_nl:
            raise ValueError("an announcement needs Dutch text")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        if self.link_url and not self.link_label_nl:
            raise ValueError("a link URL requires a Dutch link label")
        return self


class AnnouncementCreate(AnnouncementWrite):
    pass


class AnnouncementUpdate(AnnouncementFields):
    """Partial update: an empty string clears a translation; the merged result is validated."""


class AnnouncementReorder(RequestModel):
    ordered_ids: list[str] = Field(min_length=1)


class AnnouncementOut(ResponseModel):
    id: str
    text_nl: str | None
    text_fr: str | None
    text_en: str | None
    level: AnnouncementLevel
    active: bool
    sort_order: int
    starts_at: datetime | None
    ends_at: datetime | None
    link_url: str | None
    link_label_nl: str | None
    link_label_en: str | None
    link_label_fr: str | None
    published_at: datetime | None
    published_by: str | None
    created_at: datetime
    updated_at: datetime


class AnnouncementPublicOut(ResponseModel):
    id: str
    text: str
    level: AnnouncementLevel
    link_url: str | None
    link_label: str | None
