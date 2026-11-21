"""Volunteers, their help periods and the volunteer table lookups."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from typing import Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.check_in import CheckInGuestOut
from app.schemas.people import RoleStretchOut
from app.schemas.types import NonEmptyText200, Text20, Text50, Text300, Text2000


class VolunteerHelpPeriodIn(RequestModel):
    first_help_day: dt_date
    last_help_day: dt_date | None = None
    notes: Text2000 = ""

    @field_validator("notes", mode="before")
    @classmethod
    def strip_notes(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.last_help_day is not None and self.first_help_day > self.last_help_day:
            raise ValueError("first_help_day must be before or equal to last_help_day.")
        return self


class VolunteerCreate(RequestModel):
    name: NonEmptyText200
    address: Text300 = ""
    national_register_number: Text20 | None = None
    eid_document_number: Text50 | None = None
    help_periods: list[VolunteerHelpPeriodIn] = Field(default_factory=list)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("national_register_number", "eid_document_number", mode="before")
    @classmethod
    def strip_identity(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value


class VolunteerUpdate(RequestModel):
    name: NonEmptyText200 | None = None
    address: Text300 | None = None
    national_register_number: Text20 | None = None
    eid_document_number: Text50 | None = None
    help_periods: list[VolunteerHelpPeriodIn] | None = None
    oidc_subject: str | None = Field(default=None, max_length=255)
    """Admin-only override for the self-service identity link (#1006) — e.g.
    to unlink a mistaken registration (explicit ``null``) or hand-link a
    volunteer who can't or won't complete self-registration themselves.
    Normally established by the volunteer via ``POST /api/me/volunteer/register``."""

    @field_validator("name", "national_register_number", "eid_document_number", "oidc_subject", mode="before")
    @classmethod
    def strip_optional_strings(cls, value: str | None) -> str | None:
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        return stripped or None


class VolunteerPeriodOut(ResponseModel):
    id: int
    first_help_day: dt_date
    last_help_day: dt_date | None
    notes: str

    model_config = ConfigDict(from_attributes=True)


class VolunteerOut(ResponseModel):
    id: str
    name: str
    address: str
    national_register_number: str | None
    eid_document_number: str | None
    anonymised: bool
    retired_roles: dict[str, str] = {}
    role_history: dict[str, list[RoleStretchOut]] = {}
    help_periods: list[VolunteerPeriodOut]
    oidc_subject: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VolunteerListEnvelope(ResponseModel):
    """Paginated response for the admin volunteers list. See ``PersonListEnvelope``."""

    items: list[VolunteerOut]
    total: int
    limit: int
    page: int


class VolunteerTableMatchOut(ResponseModel):
    table_id: str
    table_name: str
    capacity: int
    layout_id: str


class VolunteerTableResolveOut(ResponseModel):
    tables: list[VolunteerTableMatchOut]
    count: int


class VolunteerTableCandidateOut(ResponseModel):
    table_id: str
    table_name: str


class VolunteerTableOrdersOut(ResponseModel):
    """PII-free registrations allocated to one table."""

    table_id: str
    table_name: str
    registrations: list[CheckInGuestOut]
    count: int


class VolunteerTableOrdersUnresolvedOut(ResponseModel):
    """A table reference matching no table, or several, so no orders are listed."""

    table_reference: str
    registrations: list[CheckInGuestOut]
    candidates: list[VolunteerTableCandidateOut]
    message: str
