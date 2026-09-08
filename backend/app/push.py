"""Web Push delivery (#941): VAPID-signed payloads via pywebpush.

This module owns admin test-send and the shared delivery primitives reused
by app.composer_delivery for composed broadcasts (#942). Both use the durable
outbox built for email (#947): one job per subscription, at-least-once
delivery, retry/backoff, and an audit trail. See
docs/decisions/941-web-push-foundation.md.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import socket
from datetime import UTC, datetime
from urllib.parse import urlparse

import requests
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, update

from app.config import settings
from app.database import async_session_factory
from app.models import PushSubscription

logger = logging.getLogger(__name__)

WEB_PUSH_TEST = "web_push_test"


class _NoRedirectSession(requests.Session):
    """A ``requests.Session`` that never follows redirects.

    Subscription ``endpoint`` values are visitor-supplied (see
    ``app.services.push_service.subscribe``); a redirect could otherwise
    retarget an outbound VAPID-signed request to an attacker-chosen host
    (CWE-918 SSRF) after the destination check below already ran. Passed to
    ``pywebpush.webpush`` in place of the ``requests`` module it defaults to.
    """

    def post(self, *args, **kwargs):  # type: ignore[override]
        kwargs["allow_redirects"] = False
        return super().post(*args, **kwargs)


_NO_REDIRECT_SESSION = _NoRedirectSession()

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


def _resolves_to_public_address(hostname: str) -> bool:
    """Reject a destination that resolves to a private, loopback, link-local,
    reserved, multicast, or unspecified address (CWE-918 SSRF).

    Endpoints are visitor-supplied at subscribe time (``endpoint_must_be_https``
    in app.schemas only constrains the scheme), and a hostname's DNS can change
    between subscribe and delivery (rebinding) — so this runs at delivery time,
    the actual point of egress, rather than (only) at subscribe time. Blocking
    IP ranges rather than allowlisting specific push-service hostnames avoids
    hardcoding a vendor list that would break the moment a browser vendor
    changes or adds a push-service domain.
    """
    try:
        infos = socket.getaddrinfo(hostname, None)
    except OSError:
        return False
    if not infos:
        return False
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
            or address.is_multicast
            or address.is_unspecified
        ):
            return False
    return True


def _build_test_payload() -> str:
    # Admin test-send uses fixed content; composer payload validation lives
    # in app.composer_content. The service worker notificationclick handler
    # navigates to a fixed path, not a URL carried
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
        requests_session=_NO_REDIRECT_SESSION,
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

        hostname = urlparse(subscription.endpoint).hostname
        if not hostname or not await asyncio.to_thread(_resolves_to_public_address, hostname):
            # A visitor-supplied endpoint resolving to a private/internal address
            # will never become deliverable — treat it like a 404/410 (retire,
            # don't retry) rather than let the outbox retry it forever.
            logger.warning(
                "Retiring push subscription_id=%s: endpoint does not resolve to a public address.", subscription_id
            )
            await db.execute(delete(PushSubscription).where(PushSubscription.id == subscription_id))
            await db.commit()
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

        await db.execute(
            update(PushSubscription)
            .where(PushSubscription.id == subscription_id)
            .values(last_seen_at=datetime.now(UTC))
        )
        await db.commit()

    logger.info("Sent Web Push test notification to subscription_id=%s.", subscription_id)
    return True
