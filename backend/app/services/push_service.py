"""Web Push subscription lifecycle (#941): subscribe, unsubscribe, cleanup.

Subscriptions are anonymous and device-scoped, not linked to ``User`` — see
``app.models.PushSubscription``. Delivery itself lives in ``app.push``, kept
separate from this CRUD/validation layer the same way ``app.email`` and the
registration/contact services are already split in this codebase.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Event, PushSubscription
from app.services.errors import ValidationFailedError
from app.utils import make_id

_CATEGORY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,49}$")
_MAX_CATEGORIES = 10
_MAX_EVENT_IDS = 20


def _normalize_categories(categories: list[str]) -> list[str]:
    if len(categories) > _MAX_CATEGORIES:
        raise ValidationFailedError(f"A subscription may opt into at most {_MAX_CATEGORIES} categories.")
    for category in categories:
        if not _CATEGORY_PATTERN.match(category):
            raise ValidationFailedError(f"Invalid category '{category}': expected lowercase snake_case.")
    # De-duplicate while preserving order — categories is a set of tags, not a sequence.
    return list(dict.fromkeys(categories))


async def _validate_event_ids(db: AsyncSession, event_ids: list[str]) -> list[str]:
    if not event_ids:
        return []
    if len(event_ids) > _MAX_EVENT_IDS:
        raise ValidationFailedError(f"A subscription may be event-scoped to at most {_MAX_EVENT_IDS} events.")
    deduped = list(dict.fromkeys(event_ids))
    found = (await db.execute(select(Event.id).where(Event.id.in_(deduped)))).scalars().all()
    missing = set(deduped) - set(found)
    if missing:
        raise ValidationFailedError(f"Unknown event id(s): {sorted(missing)}.")
    return deduped


async def subscribe(
    db: AsyncSession,
    *,
    endpoint: str,
    p256dh_key: str,
    auth_key: str,
    locale: str,
    categories: list[str],
    event_ids: list[str],
) -> PushSubscription:
    """Create or refresh a subscription for *endpoint* (natural-key upsert).

    A browser resubscribing with the same endpoint (a locale change, an
    updated category selection, or just periodic refresh) updates the
    existing row rather than creating a duplicate — ``consent_at`` is left
    untouched on an update, since it records *first* consent, not last use.
    """
    normalized_categories = _normalize_categories(categories)
    normalized_event_ids = await _validate_event_ids(db, event_ids)
    now = datetime.now(UTC)

    existing = await db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if existing is not None:
        existing.p256dh_key = p256dh_key
        existing.auth_key = auth_key
        existing.locale = locale
        existing.categories = normalized_categories
        existing.event_ids = normalized_event_ids
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
        categories=normalized_categories,
        event_ids=normalized_event_ids,
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
        existing.categories = normalized_categories
        existing.event_ids = normalized_event_ids
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
    ``settings.push_subscription_expiry_days``; called by the daily worker sweep.

    On top of explicit unsubscribe and 404/410 retirement (see ``app.push``),
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
