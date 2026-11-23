"""Web Push subscriptions."""

from __future__ import annotations

from pydantic import Field, field_validator

from app.core.vocabularies import Locale
from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import NonEmptyText50, NonEmptyText200, NonEmptyText600, ResourceId


class PushSubscriptionKeys(RequestModel):
    """The ``keys`` object from a browser ``PushSubscription.toJSON()``."""

    p256dh: NonEmptyText200
    auth: NonEmptyText50


class PushSubscribeRequest(RequestModel):
    endpoint: NonEmptyText600
    keys: PushSubscriptionKeys
    locale: Locale
    categories: list[str] = Field(default_factory=list, max_length=10)
    event_ids: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("endpoint")
    @classmethod
    def endpoint_must_be_https(cls, v: str) -> str:
        # Push endpoints are always https:// in practice; rejecting anything
        # else up front is cheap defense against a malformed or spoofed body
        # before it ever reaches app.services.push_service.
        if not v.startswith("https://"):
            raise ValueError("endpoint must be an https:// URL")
        return v


class PushSubscriptionOut(ResponseModel):
    id: str
    categories: list[str]
    event_ids: list[str]


class PushUnsubscribeRequest(RequestModel):
    endpoint: NonEmptyText600


class VapidPublicKeyOut(ResponseModel):
    public_key: str
    enabled: bool
    """False when VAPID isn't configured server-side — the frontend shows no
    opt-in UI in that case rather than a subscribe attempt doomed to fail."""


class PushTestRequest(RequestModel):
    subscription_id: ResourceId


class PushTestQueuedOut(ResponseModel):
    queued: bool
    job_id: str
