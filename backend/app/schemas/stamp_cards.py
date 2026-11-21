"""Stamp cards, stamps and rewards."""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, field_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import NonEmptyText200, PositiveQuantity, Text200


class StampProgress(ResponseModel):
    card_id: str
    stamps: int
    box_count: int
    reward_earned: bool


class StampCardTypeWrite(RequestModel):
    name_nl: NonEmptyText200
    name_fr: Text200 | None = None
    name_en: Text200 | None = None
    box_count: PositiveQuantity
    reward_label_nl: NonEmptyText200
    reward_label_fr: Text200 | None = None
    reward_label_en: Text200 | None = None
    active: bool = True

    @field_validator("name_nl", "reward_label_nl")
    @classmethod
    def require_dutch_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Dutch text is required")
        return value


class StampRewardUpdate(RequestModel):
    handed_out: bool


class StampCardTypeOut(StampCardTypeWrite):
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    id: str


class StampOut(ResponseModel):
    id: str
    card_id: str
    registration_id: str
    created_at: datetime


class StampRewardOut(ResponseModel):
    id: str
    card_id: str
    reward_label_nl: str
    reward_label_fr: str | None
    reward_label_en: str | None
    earned_at: datetime
    handed_out_at: datetime | None
    handed_out_by: str | None


class StampCardOut(ResponseModel):
    id: str
    person_id: str
    type_id: str
    box_count: int
    reward_label_nl: str
    reward_label_fr: str | None
    reward_label_en: str | None
    opened_at: datetime
    completed_at: datetime | None
    stamps: list[StampOut]
    reward: StampRewardOut | None
