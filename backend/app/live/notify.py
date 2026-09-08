"""Transactional Postgres NOTIFY publication for LiveEvents.

Publish inside the same
transaction as the mutation, on the same session, so publication is
transactional — Postgres holds a NOTIFY sent inside a transaction until that
transaction commits, and drops it entirely if the transaction rolls back.
Call ``notify_live_event`` before ``db.commit()``, never after.

The actual cross-worker fan-out (relaying a NOTIFY into every worker's local
``LiveBus``, including the one that sent it) is ``app.live.listener``'s job.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.live.events import LiveEvent

LIVE_EVENTS_CHANNEL = "live_events"

# Bare NOTIFY doesn't support bind parameters; pg_notify(channel, payload) does.
_NOTIFY_SQL = text("SELECT pg_notify(:channel, :payload)")


async def notify_live_event(db: AsyncSession, event: LiveEvent) -> None:
    """Queue *event* for cross-worker delivery, committed atomically with the caller's write.

    Must be called before ``db.commit()`` on the same session as the mutation
    it announces — see the module docstring.
    """
    await db.execute(_NOTIFY_SQL, {"channel": LIVE_EVENTS_CHANNEL, "payload": event.to_notify_payload()})
