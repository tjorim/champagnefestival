"""HTTP error bodies the application answers with, whatever raised them.

Every failure body is JSON with ``detail`` and a stable machine-readable ``code`` (``ApiHTTPException`` in
``app.services.errors`` for the codes the application chooses); clients translate ``code`` and treat ``detail`` as an
English diagnostic. The handlers here cover the failures nothing in the application raised with a code: an unhandled
exception, a framework or dependency ``HTTPException`` and a request that fails validation.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
INTERNAL_ERROR_DETAIL = "Internal server error"
INTERNAL_ERROR_CODE = "internal_error"
VALIDATION_ERROR_CODE = "validation_error"


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


_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
}


def default_error_code(status_code: int) -> str:
    """The stable ``code`` for an HTTP error that carries none of its own (``http_<status>`` when not listed)."""
    return _STATUS_CODES.get(status_code, f"http_{status_code}")


async def handle_http_exception(request: Request, exc: Exception) -> Response:
    """Render a framework or dependency ``HTTPException`` with its ``detail`` unchanged and a ``code`` added.

    Replaces FastAPI's default handler (unknown route, wrong method, a bare ``HTTPException``). A ``code`` the
    exception already carries (``ApiHTTPException``) is kept, and its headers (``WWW-Authenticate``, ``Retry-After``,
    ``Allow``) are passed on; a bodiless status (1xx, 204, 304) stays bodiless.
    """
    if not isinstance(exc, StarletteHTTPException):
        raise exc
    headers = getattr(exc, "headers", None)
    if exc.status_code < 200 or exc.status_code in (204, 304):
        return Response(status_code=exc.status_code, headers=headers)
    return JSONResponse(
        {"detail": exc.detail, "code": getattr(exc, "code", None) or default_error_code(exc.status_code)},
        status_code=exc.status_code,
        headers=headers,
    )


# ``input`` (the submitted value) and ``ctx`` (constraint values, sometimes the raw cause) can echo secrets or PII.
_UNSAFE_VALIDATION_KEYS = frozenset({"input", "ctx"})


async def handle_validation_error(request: Request, exc: Exception) -> Response:
    """Render a 422 as FastAPI's ``detail`` list (``type``, ``loc``, ``msg``) without the submitted values.

    ``detail`` stays a list, as the frontend and the generated client read it; ``code`` is added next to it.
    """
    if not isinstance(exc, RequestValidationError):
        raise exc
    detail = [
        {key: value for key, value in issue.items() if key not in _UNSAFE_VALIDATION_KEYS} for issue in exc.errors()
    ]
    return JSONResponse(
        {"detail": detail, "code": VALIDATION_ERROR_CODE}, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT
    )
