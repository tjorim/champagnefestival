"""SSE live-update stream endpoint."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from starlette.responses import StreamingResponse

from app.auth import require_volunteer
from app.live import live_bus
from app.live.events import LiveEvent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/live", tags=["live"])

HEARTBEAT_INTERVAL: float = 15.0

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


def get_heartbeat_interval() -> float:
    """Return the SSE heartbeat interval in seconds.

    Exposed as a dependency so tests can override it without monkeypatching.
    """
    return HEARTBEAT_INTERVAL


async def _sse_generator(
    *,
    edition_id: str | None,
    event_id: str | None,
    heartbeat_interval: float,
) -> AsyncIterator[str]:
    async with live_bus.subscribe() as queue:
        yield 'event: ready\ndata: {"ok":true}\n\n'
        loop = asyncio.get_running_loop()
        last_sent = loop.time()
        while True:
            # Compute how long until the next keepalive is due.  This must be
            # recalculated on every iteration so that filtering out non-matching
            # events does not starve the heartbeat timer.
            remaining = heartbeat_interval - (loop.time() - last_sent)
            if remaining <= 0:
                yield ": keepalive\n\n"
                last_sent = loop.time()
                remaining = heartbeat_interval

            try:
                event: LiveEvent = await asyncio.wait_for(
                    queue.get(), timeout=remaining
                )
            except TimeoutError:
                yield ": keepalive\n\n"
                last_sent = loop.time()
                continue

            # Scope filtering: skip events that don't match the requested scope.
            # A None scope value on the event means "applies to all".
            if edition_id is not None and event.scope.edition_id not in (None, edition_id):
                continue
            if event_id is not None and event.scope.event_id not in (None, event_id):
                continue

            yield event.to_sse_data()
            last_sent = loop.time()


@router.get("/stream")
async def live_stream(
    edition_id: str | None = None,
    event_id: str | None = None,
    _: None = Depends(require_volunteer),
    heartbeat_interval: float = Depends(get_heartbeat_interval),
) -> StreamingResponse:
    """SSE stream of invalidation events for event-day operational views.

    Requires the ``volunteer`` or ``admin`` realm role.
    Accepts optional ``?edition_id=`` and ``?event_id=`` scope filters.
    Emits ``event: invalidate`` frames; clients call
    ``queryClient.invalidateQueries`` for each key in the payload.
    Sends ``: keepalive`` comments every 15 s to keep reverse proxies alive.
    """
    return StreamingResponse(
        _sse_generator(
            edition_id=edition_id,
            event_id=event_id,
            heartbeat_interval=heartbeat_interval,
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
