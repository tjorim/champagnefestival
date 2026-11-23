"""The audit trail."""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict

from app.schemas.actors import ActorLabel
from app.schemas.base import ResponseModel


class AuditEntryBaseOut(ResponseModel):
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


class AuditEntryOut(AuditEntryBaseOut):
    actor_label: ActorLabel
    resource_name: str | None
    resource_exists: bool


class AuditActorOut(ResponseModel):
    actor: str
    actor_label: ActorLabel
