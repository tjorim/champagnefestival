"""Shared error types for application services.

Application services (``app/services/*_service.py``) implement validation,
locking, and cascade-guard logic once, but REST (``app/routers/*.py``) and MCP
(``app/mcp/admin/*.py``) each have their own error convention: FastAPI wants an
``HTTPException`` with a status code, MCP tools want a plain ``ValueError``
whose message reaches the calling agent. Services raise one of the exceptions
below instead of either of those, and each adapter translates it at its own
boundary (see ``app.services.errors.to_http_exception`` and
``app.mcp.utils.as_value_error`` — MCP adapters can also just do
``raise ValueError(str(exc)) from exc``).
"""

from __future__ import annotations


class ServiceError(Exception):
    """Base class for errors raised by application services.

    ``status_code`` mirrors the HTTP status the REST adapter should return.
    ``str(exc)`` (and ``exc.message``) is the human-readable detail shared
    verbatim by both adapters.
    """

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class NotFoundError(ServiceError):
    """Raised when a referenced resource does not exist (404)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=404)


class ConflictError(ServiceError):
    """Raised when an operation conflicts with existing state (409)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=409)


class ValidationFailedError(ServiceError):
    """Raised for a business-rule validation failure that isn't a 404/409 (400)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=400)


def to_http_exception(exc: ServiceError):
    """Convert a ``ServiceError`` into a FastAPI ``HTTPException`` for REST adapters."""
    from fastapi import HTTPException

    return HTTPException(status_code=exc.status_code, detail=exc.message)
