"""Policies and their versions."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.faq import FaqLocale
from app.schemas.types import MarkdownSource, Text2000

PolicyVersionStatus = Literal["draft", "published", "superseded"]


class PolicyVersionOut(ResponseModel):
    """Admin shape: full per-locale Markdown source and provenance for one version."""

    id: str
    policy_key: str
    version_number: int
    status: PolicyVersionStatus
    content_nl: str | None
    content_fr: str | None
    content_en: str | None
    change_summary: str | None
    created_at: datetime
    created_by: str
    updated_at: datetime
    published_at: datetime | None
    published_by: str | None

    model_config = ConfigDict(from_attributes=True)


class PolicyOut(ResponseModel):
    """Admin shape: the policy plus its full version history, newest first."""

    key: str
    title_nl: str | None
    title_fr: str | None
    title_en: str | None
    versions: list[PolicyVersionOut]


class PolicyDraftCreate(RequestModel):
    """Seed a new draft.

    Omit ``source_version_number`` to copy the current published version (the
    normal "edit from current" flow). Pass an older, historical version's
    number instead to seed a rollback draft with that version's content —
    publishing it is what actually performs the rollback.
    """

    source_version_number: int | None = None


class PolicyDraftUpdate(RequestModel):
    """Edit the open draft. The draft may be incomplete; publishing requires Dutch text."""

    content_nl: MarkdownSource | None = None
    content_fr: MarkdownSource | None = None
    content_en: MarkdownSource | None = None
    change_summary: Text2000 | None = None


class PolicyRenderRequest(RequestModel):
    """Render arbitrary, not-yet-saved Markdown for live preview.

    Uses the exact same renderer/sanitizer as the public endpoint, so what an
    admin previews here is guaranteed to match what publishing would produce.
    """

    markdown: MarkdownSource = ""


class PolicyRenderOut(ResponseModel):
    html: str


class PolicyPublicOut(ResponseModel):
    key: str
    title: str
    locale: FaqLocale
    """The language `html` is written in: the requested one, or Dutch when that locale
    has no content."""
    html: str
    version_number: int
    published_at: datetime
