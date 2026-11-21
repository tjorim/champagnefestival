"""Live-update SSE broadcast infrastructure.

Mutation routes publish via ``notify_live_event`` (transactional Postgres
NOTIFY, before ``db.commit()`` — see ``app.services.live.notify``); the SSE endpoint
subscribes to the module-level ``live_bus`` singleton. ``app.services.live.listener``
relays NOTIFYs into ``live_bus`` — mutation routes never call
``live_bus.publish`` directly.
``app.services.live.mapping`` is the authoritative source of which TanStack Query
keys are invalidated by each domain action.
"""

from app.services.live.bus import live_bus as live_bus
from app.services.live.events import LiveEvent as LiveEvent
from app.services.live.events import LiveScope as LiveScope
from app.services.live.notify import notify_live_event as notify_live_event

__all__ = ["live_bus", "LiveEvent", "LiveScope", "notify_live_event"]
