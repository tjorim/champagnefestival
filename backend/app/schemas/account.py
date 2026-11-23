"""A visitor's account: sessions, lookups, communication preference and Pebble token."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field, field_validator

from app.core.vocabularies import Locale
from app.schemas.base import RequestModel, ResponseModel


class PebbleAccessTokenOut(ResponseModel):
    token: str


class CommunicationPreferenceOut(ResponseModel):
    preferred_language: Locale | None


class CommunicationPreferenceUpdate(RequestModel):
    preferred_language: Locale


class RegistrationLookupRequest(RequestModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def strip_email_whitespace(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


class RegistrationLookupRequestAccepted(ResponseModel):
    ok: bool = True
    delivery_mode: Literal["email"] = "email"
    expires_in_minutes: int


class RegistrationAccessLookupRequest(RequestModel):
    token: str = Field(min_length=20)


class VisitorSessionStatus(ResponseModel):
    """Whether the caller currently holds a valid visitor session (#953)."""

    authenticated: bool
    expires_at: datetime | None = None
