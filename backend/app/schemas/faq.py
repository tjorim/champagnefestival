"""Frequently asked questions."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import Text500, Text10000


class FaqTextFields(RequestModel):
    """A question and its answer per language (#1222): Dutch must have both, the
    others are optional, and a language is shown only when both its question and
    answer have text. A blank text is stored as `None`."""

    question_nl: Text500 | None = None
    question_fr: Text500 | None = None
    question_en: Text500 | None = None
    answer_nl: Text10000 | None = None
    answer_fr: Text10000 | None = None
    answer_en: Text10000 | None = None

    @field_validator("question_nl", "question_fr", "question_en", "answer_nl", "answer_fr", "answer_en", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.question_nl or not self.answer_nl:
            raise ValueError("A FAQ item requires a Dutch question and a Dutch answer.")
        return self


class FaqItemCreate(FaqTextFields):
    active: bool = True

    @model_validator(mode="after")
    def check_text(self) -> Self:
        return self.validate_dutch()


class FaqItemUpdate(FaqTextFields):
    """Partial update: an empty string clears a translation, the Dutch text cannot be cleared."""

    active: bool | None = None


class FaqItemReorder(RequestModel):
    """The complete, ordered list of every existing FAQ item's ID.

    `sort_order` isn't settable through create/update — this is the only way
    to change display order, and it takes the whole collection at once so a
    reorder can't leave things ambiguous or race another admin's reorder (#836).
    """

    ordered_ids: list[str] = Field(min_length=1)


class FaqItemOut(ResponseModel):
    """Admin shape: every language's content, for the FAQ editor."""

    id: str
    question_nl: str | None
    question_fr: str | None
    question_en: str | None
    answer_nl: str | None
    answer_fr: str | None
    answer_en: str | None
    sort_order: int
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FaqItemPublicOut(ResponseModel):
    """Public shape: one locale's question/answer, already resolved server-side
    (Dutch when that locale is not fully translated)."""

    id: str
    question: str
    answer: str
