"""In-process asyncio pub/sub hub for live-update events."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from app.live.events import LiveEvent

logger = logging.getLogger(__name__)


class LiveBus:
    """Broadcast LiveEvent instances to all active SSE subscribers.

    Each subscriber gets a bounded asyncio.Queue.  When the queue is full
    the newest event is dropped and a warning is logged (slow-consumer
    protection).  The bus is intentionally in-process: events are lost on
    restart, which is acceptable because notify-then-pull clients do a
    blanket invalidate on reconnect.
    """

    def __init__(self, max_queue_size: int = 100) -> None:
        self._max_queue_size = max_queue_size
        self._subscribers: list[asyncio.Queue[LiveEvent]] = []

    @contextlib.asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[LiveEvent]]:
        """Yield a per-subscriber Queue; remove it on exit."""
        queue: asyncio.Queue[LiveEvent] = asyncio.Queue(maxsize=self._max_queue_size)
        self._subscribers.append(queue)
        try:
            yield queue
        finally:
            self._subscribers.remove(queue)

    async def publish(self, event: LiveEvent) -> None:
        """Deliver *event* to every subscriber; drop for slow consumers."""
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(
                    "live_bus: dropped event for slow subscriber (queue full, maxsize=%d)",
                    self._max_queue_size,
                )

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)


# Module-level singleton used by routers and mutation hooks.
live_bus = LiveBus()
