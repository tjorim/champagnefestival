"""Shared request/response base models."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class RequestModel(BaseModel):
    """Base for external request bodies; reject misspelled or stale fields."""

    model_config = ConfigDict(extra="forbid")


class ResponseModel(BaseModel):
    """Base for response bodies.

    A response field with a default is always sent, so the generated schema lists it as required
    (`json_schema_serialization_defaults_required`). Request bodies keep their optional defaults.
    """

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
