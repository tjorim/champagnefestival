"""``ApiHTTPException`` adds a stable ``code`` next to ``detail`` in the response body.

``detail`` stays the English diagnostic; clients translate ``code`` and fall back
to a translated operation message when the code is unknown (see #1251).
"""

from __future__ import annotations

import json

import pytest
from starlette.requests import Request

from app.main import api_http_exception_handler
from app.services.errors import ApiHTTPException, ConflictError, NotFoundError, to_http_exception


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/api/x", "headers": []})


@pytest.mark.anyio
async def test_handler_renders_code_next_to_detail_and_keeps_headers():
    exc = ApiHTTPException(401, "pebble_token_invalid", "Invalid", headers={"WWW-Authenticate": "Bearer"})
    response = await api_http_exception_handler(_request(), exc)
    assert response.status_code == 401
    assert json.loads(bytes(response.body)) == {"detail": "Invalid", "code": "pebble_token_invalid"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_service_error_with_a_code_becomes_an_api_http_exception():
    http_exc = to_http_exception(ConflictError("Already decided.", code="organization_change_conflict"))
    assert isinstance(http_exc, ApiHTTPException)
    assert (http_exc.status_code, http_exc.code, http_exc.detail) == (
        409,
        "organization_change_conflict",
        "Already decided.",
    )


def test_service_error_without_a_code_stays_a_plain_http_exception():
    http_exc = to_http_exception(NotFoundError("Nope."))
    assert not isinstance(http_exc, ApiHTTPException)
    assert (http_exc.status_code, http_exc.detail) == (404, "Nope.")
