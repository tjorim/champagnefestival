"""Web Push subscription and admin test-send endpoints (#941).

Subscriptions are anonymous and public — see app.models.PushSubscription and
docs/decisions/941-web-push-foundation.md. Only the test-send endpoint
requires admin auth; the rest are reachable by any visitor.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.config import settings
from app.database import get_db
from app.push import WEB_PUSH_TEST, push_enabled
from app.ratelimit import check_push_subscription_rate_limit, check_rate_limit, get_client_ip
from app.schemas import (
    PushSubscribeRequest,
    PushSubscriptionOut,
    PushTestRequest,
    PushUnsubscribeRequest,
    VapidPublicKeyOut,
)
from app.services import push_service
from app.services.errors import ServiceError, to_http_exception
from app.services.outbox_service import enqueue_job
from app.utils import make_id

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/vapid-public-key", response_model=VapidPublicKeyOut)
def get_vapid_public_key() -> VapidPublicKeyOut:
    """Public VAPID key the browser needs for ``pushManager.subscribe()``.

    The private half never leaves ``settings`` — see
    ``app.config.Settings.vapid_private_key``.
    """
    return VapidPublicKeyOut(public_key=settings.vapid_public_key, enabled=push_enabled())


@router.post("/subscriptions", response_model=PushSubscriptionOut, status_code=status.HTTP_201_CREATED)
async def subscribe_to_push(
    body: PushSubscribeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PushSubscriptionOut:
    client_ip = get_client_ip(request)
    if not await check_push_subscription_rate_limit(db, client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    try:
        subscription = await push_service.subscribe(
            db,
            endpoint=body.endpoint,
            p256dh_key=body.keys.p256dh,
            auth_key=body.keys.auth,
            locale=body.locale,
            categories=body.categories,
            event_ids=body.event_ids,
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
    return PushSubscriptionOut(id=subscription.id, categories=subscription.categories, event_ids=subscription.event_ids)


@router.post("/subscriptions/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_from_push(
    body: PushUnsubscribeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    client_ip = get_client_ip(request)
    if not await check_push_subscription_rate_limit(db, client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    await push_service.unsubscribe(db, body.endpoint)


@router.post(
    "/test",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_admin)],
)
async def send_test_push(
    body: PushTestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    """Queue a restricted admin test notification via the durable outbox (#947).

    Not retry-safe with the same request: each call enqueues a fresh job (a
    unique deduplication key per click), so a deliberate repeat sends another
    test — an accepted, low-consequence gap for an admin-only testing tool,
    not a guest-facing write. See docs/retry-safety.md.
    """
    # In-process limiter, not the Postgres-backed one: authenticated,
    # low-volume, per docs/decisions/932-multi-worker-state.md decision 1's
    # own narrower scope for admin actions (see app.ratelimit's module docstring).
    if not check_rate_limit(actor, scope="push-test-send", max_requests=10):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    # enqueue_job writes its own "delivery_queued" audit entry (see
    # app.services.outbox_service) — matching enqueue_registration_confirmation's
    # precedent, this doesn't add a second one.
    request_id = getattr(request.state, "request_id", None)
    job = await enqueue_job(
        db,
        job_type=WEB_PUSH_TEST,
        resource_type="push_subscription",
        resource_id=body.subscription_id,
        deduplication_key=f"web-push-test:{body.subscription_id}:{make_id('tst')}",
        actor=actor,
        request_id=request_id,
    )
    await db.commit()
    return {"queued": True, "job_id": job.id}
