"""Organizations (exhibitors, sponsors) and their change requests."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import ConfigDict, field_validator, model_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.people import PersonSummaryOut
from app.schemas.types import NonEmptyText200, Text500, Text600, Text2000

SponsorTier = Literal["main", "partner", "supporter"]


class OrganizationDescription(RequestModel):
    description_nl: Text600 | None = None
    description_fr: Text600 | None = None
    description_en: Text600 | None = None

    @field_validator("description_nl", "description_fr", "description_en", mode="before")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if any((self.description_fr, self.description_en)) and not self.description_nl:
            raise ValueError("A description requires non-empty Dutch text.")
        return self


class OrganizationCreate(OrganizationDescription):
    name: NonEmptyText200
    image: Text500 = ""
    website: Text500 = ""
    active: bool = True
    type: Literal["producer", "sponsor", "vendor"] = "vendor"
    contact_person_id: str | None = None

    @model_validator(mode="after")
    def check_description(self) -> Self:
        return self.validate_dutch()


class OrganizationUpdate(OrganizationDescription):
    name: NonEmptyText200 | None = None
    image: Text500 | None = None
    website: Text500 | None = None
    active: bool | None = None
    type: Literal["producer", "sponsor", "vendor"] | None = None
    contact_person_id: str | None = None


class OrganizationOut(ResponseModel):
    description_nl: str | None = None
    description_fr: str | None = None
    description_en: str | None = None
    id: int
    name: str
    image: str
    website: str
    active: bool
    type: str
    contact_person_id: str | None
    contact_person: PersonSummaryOut | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ManagedOrganizationOut(OrganizationDescription):
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    image: str
    id: int
    name: str
    type: str
    website: str
    active: bool


class OrganizationChangeSubmit(OrganizationDescription):
    submission_id: UUID
    website: Text500 | None = None

    @field_validator("website")
    @classmethod
    def validate_website(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Use an empty string to clear the website.")
        value = value.strip()
        if value and not re.match(r"^https?://.+", value):
            raise ValueError("Website must start with http:// or https://.")
        return value


class OrganizationChangeDecision(RequestModel):
    decision: Literal["accepted", "rejected"]
    reason: Text2000 | None = None


class OrganizationChangeOut(ResponseModel):
    id: str
    organization_id: int
    organization_name: str
    status: Literal["pending", "accepted", "rejected", "superseded", "replaced"]
    proposed: dict[str, str | None]
    current: dict[str, str | None]
    superseded_fields: list[str]
    reason: str | None
    created_at: datetime
