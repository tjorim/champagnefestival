"""Live-update SSE broadcast infrastructure.

Mutation routes publish via ``notify_live_event`` (transactional Postgres
NOTIFY, before ``db.commit()`` — see ``app.live.notify``); the SSE endpoint
subscribes to the module-level ``live_bus`` singleton. ``app.live.listener``
relays NOTIFYs into ``live_bus`` — mutation routes never call
``live_bus.publish`` directly (docs/decisions/932-multi-worker-state.md).
``app.live.mapping`` is the authoritative source of which TanStack Query
keys are invalidated by each domain action.
"""

from app.live.bus import live_bus as live_bus
from app.live.events import LiveEvent as LiveEvent
from app.live.events import LiveScope as LiveScope
from app.live.notify import notify_live_event as notify_live_event

__all__ = ["live_bus", "LiveEvent", "LiveScope", "notify_live_event"]
