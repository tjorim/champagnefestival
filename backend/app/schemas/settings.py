"""Application settings."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import ConfigDict, EmailStr, field_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import MemberInactivityMonths, MemberLimit, ResourceId, Text30, Text500


class AppSettingsUpdate(RequestModel):
    member_limit: MemberLimit | None = None
    member_inactivity_months: MemberInactivityMonths | None = None

    stamp_card_type_id: ResourceId | None = None
    maintenance_mode: bool | None = None
    public_email: EmailStr | Literal[""] | None = None
    public_phone: Text30 | None = None
    facebook_url: Text500 | None = None

    @field_validator("public_phone")
    @classmethod
    def validate_public_phone(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        if (
            not value.startswith("+")
            or value.count("+") != 1
            or not all(character.isdigit() or character in " +()-" for character in value)
        ):
            raise ValueError("public_phone must be empty or a valid international telephone number")
        digit_count = sum(character.isdigit() for character in value)
        if digit_count < 7:
            raise ValueError("public_phone must contain at least 7 digits")
        return value

    @field_validator("facebook_url")
    @classmethod
    def validate_facebook_url(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname:
            raise ValueError("facebook_url must be empty or use HTTPS")
        return value


class AppSettingsOut(ResponseModel):
    member_limit: int | None = None
    member_inactivity_months: int | None = None

    stamp_card_type_id: str | None = None
    maintenance_mode: bool
    public_email: str
    public_phone: str
    facebook_url: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
