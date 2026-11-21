"""HTTP error bodies the application answers with, whatever raised them.

Every failure body is JSON with ``detail`` and a stable machine-readable ``code`` (``ApiHTTPException`` in
``app.services.errors`` for the codes the application chooses); clients translate ``code`` and treat ``detail`` as an
English diagnostic. The handlers here cover the failures nothing in the application raised with a code.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import Request
from fastapi.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
INTERNAL_ERROR_DETAIL = "Internal server error"
INTERNAL_ERROR_CODE = "internal_error"


def internal_error_response() -> JSONResponse:
    """The body of every unhandled exception: ``{"detail": "Internal server error", "code": "internal_error"}``.

    Never carries the exception, its message or a stack trace; those stay in the server log and in Sentry.
    """
    return JSONResponse({"detail": INTERNAL_ERROR_DETAIL, "code": INTERNAL_ERROR_CODE}, status_code=500)


async def handle_unhandled_exception(request: Request, exc: Exception) -> Response:
    """Answer an exception no other handler took with the JSON 500 and the request id.

    ``RequestIdMiddleware`` already answers (and logs, counts and reports) an exception raised below it. One raised
    outside it reaches Starlette's outermost ``ServerErrorMiddleware``, which calls this handler and then re-raises for
    the server and Sentry; that response bypasses user middleware, so the id is read from ``request.state`` and set
    here (a fresh one when the middleware never got that far). The stack trace goes to the server log only.
    """
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    logger.error("Unhandled error: %s %s (request_id=%s)", request.method, request.url.path, request_id, exc_info=exc)
    response = internal_error_response()
    response.headers[REQUEST_ID_HEADER] = request_id
    return response
