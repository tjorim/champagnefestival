"""Per-request timing: a ``Server-Timing`` header and a slow-request warning.

Every HTTP response gets ``Server-Timing: app;dur=<ms>, db;desc="<n> queries";dur=<ms>``,
which the browser devtools show in the Network tab, and a request slower than
``SLOW_REQUEST_MS`` is logged as a warning with its route template, never the
raw path, which can carry ids or tokens.  Queries are counted through
SQLAlchemy engine events, so an N+1 pattern shows up as a high count.

Durations run until the response headers are sent: for a streamed response
(MCP over SSE) that is the time to the first byte, not the stream's length.

The same module lives in Travel, Daynest, Worktime and Champagnefestival
(tjorim/apps#246); keep the copies identical.
"""

from __future__ import annotations

import logging
import time
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

SLOW_REQUEST_MS = 300.0

logger = logging.getLogger(__name__)


@dataclass
class _DatabaseUsage:
    queries: int = 0
    seconds: float = 0.0


# One mutable object per request.  Copies of the context (thread pools, task
# groups, SQLAlchemy's asyncio greenlets) share it, so their queries count too.
_usage: ContextVar[_DatabaseUsage | None] = ContextVar("request_database_usage", default=None)


@event.listens_for(Engine, "before_cursor_execute")
def _query_started(conn: Any, cursor: Any, statement: Any, parameters: Any, context: Any, executemany: Any) -> None:
    if context is not None:
        context.request_timing_started = time.perf_counter()


@event.listens_for(Engine, "after_cursor_execute")
def _query_finished(conn: Any, cursor: Any, statement: Any, parameters: Any, context: Any, executemany: Any) -> None:
    usage = _usage.get()
    started = getattr(context, "request_timing_started", None)
    if usage is not None and started is not None:
        usage.queries += 1
        usage.seconds += time.perf_counter() - started


def _route_template(scope: Scope, root_path: str) -> str:
    # Routing extends root_path for each mount it enters; a route's own path is
    # relative to its mount.
    mounted = scope.get("root_path", "")
    path = getattr(scope.get("route"), "path", None)
    if isinstance(path, str):
        return mounted + path
    # A mounted app without FastAPI routes (MCP) sets none: name the mount.
    if mounted != root_path:
        return mounted + "/*"
    return "unmatched"


def _warn_if_slow(scope: Scope, root_path: str, status: int, elapsed_ms: float, usage: _DatabaseUsage) -> None:
    if elapsed_ms >= SLOW_REQUEST_MS:
        logger.warning(
            "slow request method=%s route=%s status=%d duration_ms=%.0f queries=%d db_ms=%.0f",
            scope["method"],
            _route_template(scope, root_path),
            status,
            elapsed_ms,
            usage.queries,
            usage.seconds * 1000,
        )


class RequestTimingMiddleware:
    """Pure ASGI, so streamed responses pass through unbuffered."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        root_path = scope.get("root_path", "")
        usage = _DatabaseUsage()
        token = _usage.set(usage)
        status: int | None = None

        async def send_with_timing(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                elapsed_ms = (time.perf_counter() - started) * 1000
                headers = MutableHeaders(raw=list(message.get("headers", [])))
                headers.append(
                    "Server-Timing",
                    f'app;dur={elapsed_ms:.1f}, db;desc="{usage.queries} queries";dur={usage.seconds * 1000:.1f}',
                )
                message = {**message, "headers": headers.raw}
                _warn_if_slow(scope, root_path, status, elapsed_ms, usage)
            await send(message)

        try:
            await self.app(scope, receive, send_with_timing)
        finally:
            _usage.reset(token)
            if status is None:  # failed before responding; the server answers 500
                _warn_if_slow(scope, root_path, 500, (time.perf_counter() - started) * 1000, usage)
