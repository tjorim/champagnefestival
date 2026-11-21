"""Request correlation: an ``X-Request-ID`` on every response, one structured access-log line per request, and the
in-process request metrics.

The id is the caller's ``X-Request-ID`` when it is a short token of letters, digits and ``._:-`` (a gateway or the
frontend may already have assigned one), otherwise a new UUID4; anything else would let a caller forge log lines. It is
stored on ``request.state.request_id`` and in ``current_request_id`` for code that logs below a request, and echoed as
``X-Request-ID`` on every response, so backend logs can be correlated with frontend errors.

The access line is JSON on the ``champagnefestival.access`` logger with the field names the other apps use (``event``,
``request_id``, ``user_id``, ``auth_type``, ``method``, ``route``, ``status_code``, ``latency_ms``)::

    {"event":"http_request","request_id":"...","user_id":"sub","auth_type":"oidc","method":"GET",
     "route":"/api/health","status_code":200,"latency_ms":1.23}

``route`` is the route template as FastAPI routes it, never the raw path or query string, which can carry registration
and check-in tokens and ids. 5xx log as errors, 4xx as warnings, the rest as info. ``latency_ms`` (and the latency in
``/api/metrics``) runs until the response headers are sent, so a streamed response (live updates over SSE) counts its
time to the first byte, not the length of the stream.

Pure ASGI: no ``BaseHTTPMiddleware`` overhead, no context-var isolation (which breaks Sentry) and no buffering of
streamed responses. An exception that escapes the app before a response starts is reported to Sentry and answered here
with the JSON 500 of ``internal_error_response`` (``{"detail": "Internal server error", "code": "internal_error"}``) that
still carries the id; once a response has started it is re-raised to the server. An exception raised outside this
middleware reaches Starlette's outermost ``ServerErrorMiddleware`` after it has unwound, so ``handle_unhandled_exception``
(``app.core.errors``) adds the id from ``request.state`` itself.
"""

import json
import logging
import re
import time
import uuid
from contextvars import ContextVar

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import internal_error_response
from app.core.logging import ACCESS_LOGGER
from app.core.observability import metrics, sentry_sdk
from app.middleware.request_timing import _route_template

REQUEST_ID_HEADER = "X-Request-ID"
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._:-]{1,128}")

access_logger = logging.getLogger(ACCESS_LOGGER)
logger = logging.getLogger(__name__)

current_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def _request_id(headers: Headers) -> str:
    supplied = headers.get(REQUEST_ID_HEADER)
    if supplied is not None and _VALID_REQUEST_ID.fullmatch(supplied):
        return supplied
    return str(uuid.uuid4())


class RequestIdMiddleware:
    """Accept or generate a correlation ID; echo it; emit a structured access log; record the request metrics."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _request_id(Headers(scope=scope))
        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        token = current_request_id.set(request_id)
        root_path = scope.get("root_path", "")
        started = time.perf_counter()
        status = 500  # an exception that escapes before a response starts is answered with a 500
        latency_ms: float | None = None
        response_started = False

        async def send_with_id(message: Message) -> None:
            nonlocal status, latency_ms, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status = message["status"]
                latency_ms = (time.perf_counter() - started) * 1000
                headers = MutableHeaders(raw=list(message.get("headers", [])))
                headers[REQUEST_ID_HEADER] = request_id
                message = {**message, "headers": headers.raw}
            await send(message)

        try:
            try:
                await self.app(scope, receive, send_with_id)
            except Exception as exc:
                logger.exception(
                    "Unhandled error in request middleware: %s %s", scope["method"], _route_template(scope, root_path)
                )
                if sentry_sdk is not None:
                    sentry_sdk.capture_exception(exc)
                if response_started:
                    raise
                await internal_error_response()(scope, receive, send_with_id)
        finally:
            current_request_id.reset(token)
            if latency_ms is None:
                latency_ms = (time.perf_counter() - started) * 1000
            metrics.record(status_code=status, latency_ms=latency_ms)
            level = logging.ERROR if status >= 500 else logging.WARNING if status >= 400 else logging.INFO
            if access_logger.isEnabledFor(level):
                access_logger.log(
                    level,
                    json.dumps(
                        {
                            "event": "http_request",
                            "request_id": request_id,
                            "user_id": state.get("user_id"),
                            "auth_type": state.get("auth_type"),
                            "method": scope["method"],
                            "route": _route_template(scope, root_path),
                            "status_code": status,
                            "latency_ms": round(latency_ms, 2),
                        },
                        separators=(",", ":"),
                        default=str,
                    ),
                )
