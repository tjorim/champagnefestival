"""Integration clients (machine access)."""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from app.core.vocabularies import IntegrationRole
from app.schemas.base import RequestModel, ResponseModel


class IntegrationClientCreate(RequestModel):
    name: str = Field(min_length=1, max_length=120)
    allowed_role: IntegrationRole
    """Fixed at creation; never more privileged than the creating admin's own tier
    (in practice always 'admin' here, since only admins can call this)."""
    rate_limit_per_minute: int = Field(default=120, ge=1, le=6000)


class IntegrationClientOut(ResponseModel):
    """Admin listing/detail shape — never includes the key hash or raw key."""

    id: str
    name: str
    key_preview: str
    allowed_role: IntegrationRole
    created_by_actor: str
    rate_limit_per_minute: int
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class IntegrationClientCreatedOut(IntegrationClientOut):
    """Returned only from create/rotate: carries the one-time raw key.

    The raw key is never stored and never retrievable again after this
    response — only its hash persists.
    """

    key: str
