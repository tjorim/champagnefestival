"""The audit trail."""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict

from app.schemas.base import ResponseModel


class AuditEntryOut(ResponseModel):
    id: str
    timestamp: datetime
    actor: str
    auth_source: str
    subject: str | None
    integration_client_id: str | None
    action: str
    resource_type: str
    resource_id: str
    request_id: str | None
    details: dict

    model_config = ConfigDict(from_attributes=True)
