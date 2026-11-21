"""Email categories, per-person preferences and consent confirmation."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.categories import CATEGORY_KEY_PATTERN
from app.schemas.types import NonEmptyText200, ResourceKey, RoleKey, SortOrder, Text100, Text500


class EmailCategoryTexts(RequestModel):
    """An email category's name and description per language (#1408): Dutch is required for the name
    (and for the description once it has any text), French and English are optional translations, and
    recipients fall back to Dutch. A blank text is stored as `None`."""

    name_nl: Text100 | None = None
    name_fr: Text100 | None = None
    name_en: Text100 | None = None
    description_nl: Text500 | None = None
    description_fr: Text500 | None = None
    description_en: Text500 | None = None

    @field_validator(
        "name_nl", "name_fr", "name_en", "description_nl", "description_fr", "description_en", mode="before"
    )
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.name_nl:
            raise ValueError("An email category requires a non-empty Dutch name.")
        if any((self.description_fr, self.description_en)) and not self.description_nl:
            raise ValueError("A description requires non-empty Dutch text.")
        return self


class EmailCategoryCreate(EmailCategoryTexts):
    key: str = Field(
        pattern=CATEGORY_KEY_PATTERN,
        description="Stable identifier consent records point at: lowercase letters, digits, `-` and `_`. Cannot be changed.",
    )
    allowed_roles: list[RoleKey] = Field(
        default_factory=list,
        max_length=10,
        description="Roles that may use the category (any one of them, not retired); empty means everyone.",
    )
    sort_order: SortOrder = 0

    @model_validator(mode="after")
    def check_texts(self) -> Self:
        return self.validate_dutch()


class EmailCategoryUpdate(EmailCategoryTexts):
    """Partial update; the key is immutable and `automatic` is not editable."""

    allowed_roles: list[RoleKey] | None = Field(default=None, max_length=10)
    sort_order: SortOrder | None = None


class EmailCategoryOut(ResponseModel):
    key: str
    name: str
    """The name resolved for the requested `locale` (Dutch when none)."""
    description: str | None
    name_nl: str
    name_fr: str | None
    name_en: str | None
    description_nl: str | None
    description_fr: str | None
    description_en: str | None
    allowed_roles: list[str]
    automatic: bool
    """Sent by application code when something happens (not composed by an administrator)."""
    sort_order: int
    created_at: datetime
    updated_at: datetime


class EmailPreferenceOut(ResponseModel):
    key: str
    name: str
    description: str | None
    automatic: bool
    consented: bool
    granted_at: datetime | None


class EmailPreferencesOut(ResponseModel):
    email: str | None
    """The verified address the preferences are for; `None` when the sign-in has no verified address."""
    categories: list[EmailPreferenceOut]


class EmailPreferencesUpdate(RequestModel):
    consents: dict[ResourceKey, bool] = Field(
        min_length=1,
        max_length=100,
        description="Category key to the wanted state; categories that are not listed stay unchanged.",
    )


class EmailConsentConfirm(RequestModel):
    token: NonEmptyText200
    locale: Literal["nl", "fr", "en"] | None = None


class EmailConsentConfirmedOut(ResponseModel):
    category_key: str
    category_name: str
    """The category name resolved for the requested `locale` (Dutch when none)."""


class EmailConsentOut(ResponseModel):
    id: str
    category_key: str
    category_name: str
    source: str
    granted_at: datetime
    revoked_at: datetime | None
    revoked_source: str | None
