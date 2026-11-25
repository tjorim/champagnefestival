"""Web Push subscription lifecycle (#941): subscribe, unsubscribe, cleanup.

Subscriptions are anonymous and device-scoped, not linked to ``User`` — see
``app.models.PushSubscription``. Delivery itself lives in ``app.services.push_delivery``, kept
separate from this CRUD/validation layer the same way ``app.services.email_service`` and the
registration/contact services are already split in this codebase.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.ids import make_id
from app.models import PushSubscription


async def subscribe(
    db: AsyncSession,
    *,
    endpoint: str,
    p256dh_key: str,
    auth_key: str,
    locale: str,
) -> PushSubscription:
    """Create or refresh a subscription for *endpoint* (natural-key upsert).

    A browser resubscribing with the same endpoint (a locale change or just a
    periodic refresh) updates the
    existing row rather than creating a duplicate — ``consent_at`` is left
    untouched on an update, since it records *first* consent, not last use.
    """
    now = datetime.now(UTC)

    existing = await db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if existing is not None:
        existing.p256dh_key = p256dh_key
        existing.auth_key = auth_key
        existing.locale = locale
        existing.last_seen_at = now
        await db.commit()
        await db.refresh(existing)
        return existing

    subscription = PushSubscription(
        id=make_id("psh"),
        endpoint=endpoint,
        p256dh_key=p256dh_key,
        auth_key=auth_key,
        locale=locale,
        consent_at=now,
        created_at=now,
        last_seen_at=now,
    )
    db.add(subscription)
    try:
        await db.commit()
    except IntegrityError:
        # Concurrent first subscribe for the same endpoint — the loser here
        # converges to an update, mirroring get_or_create_user's recovery.
        await db.rollback()
        existing = await db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
        if existing is None:
            raise
        existing.p256dh_key = p256dh_key
        existing.auth_key = auth_key
        existing.locale = locale
        existing.last_seen_at = now
        await db.commit()
        await db.refresh(existing)
        return existing
    await db.refresh(subscription)
    return subscription


async def unsubscribe(db: AsyncSession, endpoint: str) -> None:
    """Delete the subscription for *endpoint*, if any.

    Convergent — repeating this after the row is already gone is a no-op,
    safe to retry.
    """
    await db.execute(delete(PushSubscription).where(PushSubscription.endpoint == endpoint))
    await db.commit()


async def cleanup_expired_subscriptions(db: AsyncSession) -> int:
    """Delete subscriptions with no successful delivery in
    ``settings.push_subscription_expiry_days``; run daily by ``python -m app.services.maintenance housekeeping``.

    On top of explicit unsubscribe and 404/410 retirement (see ``app.services.push_delivery``),
    this catches subscriptions the push service never reports dead — e.g. the
    visitor cleared browser data without the endpoint itself expiring.
    """
    cutoff = datetime.now(UTC) - timedelta(days=settings.push_subscription_expiry_days)
    deleted_ids = (
        await db.scalars(
            delete(PushSubscription).where(PushSubscription.last_seen_at < cutoff).returning(PushSubscription.id)
        )
    ).all()
    await db.commit()
    return len(deleted_ids)
