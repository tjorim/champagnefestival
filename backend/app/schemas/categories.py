"""Event and product categories."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import SortOrder, Text100

CATEGORY_KEY_PATTERN = r"^[a-z][a-z0-9_-]{0,49}$"


class CategoryLabels(RequestModel):
    """Per-language label of an event or product category: Dutch must have text."""

    label_nl: Text100 | None = None
    label_fr: Text100 | None = None
    label_en: Text100 | None = None

    @field_validator("label_nl", "label_fr", "label_en", mode="before")
    @classmethod
    def normalize_label(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.label_nl:
            raise ValueError("A category label requires non-empty Dutch text.")
        return self


class CategoryCreate(CategoryLabels):
    key: str = Field(
        pattern=CATEGORY_KEY_PATTERN,
        description="Stable identifier stored on the events or products using it: lowercase letters, digits, `-` and `_`. Cannot be changed.",
    )
    sort_order: SortOrder = 0

    @model_validator(mode="after")
    def check_label(self) -> Self:
        return self.validate_dutch()


class CategoryUpdate(CategoryLabels):
    """Partial update; the key is immutable."""

    sort_order: SortOrder | None = None


class CategoryOut(ResponseModel):
    key: str
    label: str
    """The label resolved for the requested `locale` (Dutch when none)."""
    label_nl: str | None
    label_fr: str | None
    label_en: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
