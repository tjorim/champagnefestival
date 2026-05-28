"""Live-update SSE broadcast infrastructure.

The module-level ``live_bus`` singleton is the only object that mutation
routes and the SSE endpoint need to import.
``app.live.mapping`` is the authoritative source of which TanStack Query
keys are invalidated by each domain action.
"""

from app.live.bus import live_bus as live_bus
from app.live.events import LiveEvent as LiveEvent
from app.live.events import LiveScope as LiveScope

__all__ = ["live_bus", "LiveEvent", "LiveScope"]
