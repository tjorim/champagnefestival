"""Web Push delivery (#941): VAPID-signed payloads via pywebpush.

Test-send is the only sender in this phase — no general broadcast composer
(#942 owns that). Delivery goes through the same durable outbox #947 built
for email (see app.services.outbox_service), not a parallel pipeline: one
job per subscription, at-least-once delivery, retry/backoff, and an audit
trail come for free — see docs/decisions/941-web-push-foundation.md.
"""

from __future__ import annotations

import asyncio
import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy import delete

from app.config import settings
from app.database import async_session_factory
from app.models import PushSubscription

logger = logging.getLogger(__name__)

WEB_PUSH_TEST = "web_push_test"

#: Push services reject payloads over ~4KB; the fixed test payload below is
#: far under this, but the check stays as a real guard (not just a comment)
#: per the issue's "validate payload size" security requirement, ahead of any
#: future sender that accepts admin-supplied text.
_MAX_PAYLOAD_BYTES = 4096

#: A push service reports these when a subscription is gone (unsubscribed
#: client-side, browser data cleared, etc.) — retrying is pointless; the
#: retirement itself is the useful outcome.
_INVALID_SUBSCRIPTION_STATUSES = {404, 410}


def push_enabled() -> bool:
    """Whether VAPID is fully configured. Mirrors email.py's SMTP-configured check."""
    return bool(settings.vapid_public_key and settings.vapid_private_key and settings.vapid_subject)


def _build_test_payload() -> str:
    # Fixed content, not admin-supplied text — #941 ships no composer, so
    # there is no free-text input to validate beyond this static message.
    # notificationclick below navigates to a fixed path, not a URL carried
    # in this payload, so there is no admin-controlled target URL either.
    payload = json.dumps({"title": "Champagnefestival", "body": "Test notification delivered successfully."})
    if len(payload.encode("utf-8")) > _MAX_PAYLOAD_BYTES:
        raise ValueError("Web Push payload exceeds the maximum size.")
    return payload


def _send_sync(subscription: PushSubscription, payload: str) -> None:
    webpush(
        subscription_info={
            "endpoint": subscription.endpoint,
            "keys": {"p256dh": subscription.p256dh_key, "auth": subscription.auth_key},
        },
        data=payload,
        vapid_private_key=settings.vapid_private_key,
        vapid_claims={"sub": settings.vapid_subject},
    )


async def deliver_web_push_test(subscription_id: str) -> bool:
    """Outbox handler for ``WEB_PUSH_TEST`` jobs — see ``app.services.outbox_service``.

    Returns ``True`` (job "delivered", no retry) both on a genuine
    successful send *and* when the subscription turns out to be dead
    (404/410): retrying a dead endpoint is pointless, and retiring it is
    itself the useful outcome, matching the issue's "retire subscriptions
    on 404/410" requirement. Returns ``False`` (retried with backoff) for
    any other failure — a transient network or push-service error.
    """
    if not push_enabled():
        logger.warning("Web Push test send skipped for subscription_id=%s: VAPID is not configured.", subscription_id)
        return False

    async with async_session_factory() as db:
        subscription = await db.get(PushSubscription, subscription_id)
        if subscription is None:
            # Already gone (e.g. unsubscribed between enqueue and delivery) — nothing to retry.
            return True

        try:
            payload = _build_test_payload()
            await asyncio.to_thread(_send_sync, subscription, payload)
        except WebPushException as exc:
            if exc.status_code in _INVALID_SUBSCRIPTION_STATUSES:
                logger.info("Retiring push subscription_id=%s after status=%s.", subscription_id, exc.status_code)
                await db.execute(delete(PushSubscription).where(PushSubscription.id == subscription_id))
                await db.commit()
                return True
            logger.warning("Web Push test send failed for subscription_id=%s: %s", subscription_id, exc)
            return False
        except Exception:
            logger.exception("Unexpected error sending Web Push test to subscription_id=%s.", subscription_id)
            return False

    logger.info("Sent Web Push test notification to subscription_id=%s.", subscription_id)
    return True
