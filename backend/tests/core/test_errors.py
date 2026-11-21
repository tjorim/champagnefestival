"""``app.core.errors``: the handlers that give failures nothing else answers the shared JSON body."""

from __future__ import annotations

import json
import logging

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, Field, ValidationError
from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.errors import (
    default_error_code,
    handle_http_exception,
    handle_unhandled_exception,
    handle_validation_error,
)
from app.services.errors import ApiHTTPException


class _SetRequestId:
    """Stands in for ``RequestIdMiddleware``: stores the id the way it does, but never catches anything."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        scope.setdefault("state", {})["request_id"] = "outer-id-1"
        await self.app(scope, receive, send)


def _app(*, with_middleware: bool) -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(Exception, handle_unhandled_exception)
    if with_middleware:
        app.add_middleware(_SetRequestId)

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret-token postgresql://user:password@db/champagne")

    @app.get("/boom/{token}")
    async def boom_with_token(token: str) -> None:
        raise RuntimeError("boom")

    return app


@pytest.mark.anyio
async def test_the_log_names_the_route_template_not_the_raw_path(caplog):
    # A path can carry a credential (an access or check-in token), so the log must never contain it.
    transport = ASGITransport(app=_app(with_middleware=True), raise_app_exceptions=False)
    with caplog.at_level(logging.ERROR, logger="app.core.errors"):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/boom/secret-path-token")

    assert response.status_code == 500
    [record] = [r for r in caplog.records if r.name == "app.core.errors"]
    assert "/boom/{token}" in record.getMessage()
    assert "secret-path-token" not in record.getMessage()


@pytest.mark.anyio
async def test_the_outermost_500_is_json_and_carries_the_request_id(caplog):
    # Starlette's ``ServerErrorMiddleware`` answers an exception raised outside ``RequestIdMiddleware`` after the
    # middleware stack has unwound, so the handler reads the id from the request state itself.
    transport = ASGITransport(app=_app(with_middleware=True), raise_app_exceptions=False)
    with caplog.at_level(logging.ERROR, logger="app.core.errors"):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/boom")

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/json"
    assert response.headers["x-request-id"] == "outer-id-1"
    assert response.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert "secret-token" not in response.text
    # The traceback is logged on the server, with the id, never sent.
    [record] = [r for r in caplog.records if r.name == "app.core.errors"]
    assert "outer-id-1" in record.getMessage()
    assert record.exc_info is not None
    assert "secret-token" in str(record.exc_info[1])


@pytest.mark.anyio
async def test_the_outermost_500_gets_a_fresh_id_when_no_middleware_set_one():
    transport = ASGITransport(app=_app(with_middleware=False), raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom")

    assert response.status_code == 500
    assert response.headers["x-request-id"]
    assert response.json() == {"detail": "Internal server error", "code": "internal_error"}


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/api/x", "headers": []})


@pytest.mark.parametrize(
    ("status_code", "code"),
    [
        (400, "bad_request"),
        (401, "unauthorized"),
        (403, "forbidden"),
        (404, "not_found"),
        (405, "method_not_allowed"),
        (409, "http_409"),
        (429, "http_429"),
        (503, "http_503"),
    ],
)
def test_default_error_code(status_code, code):
    assert default_error_code(status_code) == code


@pytest.mark.anyio
async def test_a_bare_http_exception_keeps_its_detail_and_headers_and_gains_a_code():
    exc = HTTPException(429, "Slow down", headers={"Retry-After": "7", "WWW-Authenticate": "Bearer"})
    response = await handle_http_exception(_request(), exc)

    assert response.status_code == 429
    assert json.loads(bytes(response.body)) == {"detail": "Slow down", "code": "http_429"}
    assert response.headers["retry-after"] == "7"
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.anyio
async def test_a_structured_detail_is_kept():
    response = await handle_http_exception(_request(), HTTPException(409, {"conflicts": [1, 2]}))

    assert json.loads(bytes(response.body)) == {"detail": {"conflicts": [1, 2]}, "code": "http_409"}


@pytest.mark.anyio
async def test_a_code_the_exception_carries_is_never_replaced():
    exc = ApiHTTPException(404, "registration_not_found", "Nope")
    response = await handle_http_exception(_request(), exc)

    assert json.loads(bytes(response.body)) == {"detail": "Nope", "code": "registration_not_found"}


@pytest.mark.anyio
@pytest.mark.parametrize("status_code", [204, 304])
async def test_bodiless_statuses_stay_bodiless(status_code):
    response = await handle_http_exception(_request(), HTTPException(status_code))

    assert response.status_code == status_code
    assert bytes(response.body) == b""


@pytest.mark.anyio
async def test_a_foreign_exception_is_not_swallowed():
    with pytest.raises(ValueError, match="x"):
        await handle_http_exception(_request(), ValueError("x"))


class _Item(BaseModel):
    name: str = Field(min_length=3)
    count: int = Field(ge=1)


@pytest.mark.anyio
async def test_a_validation_error_drops_input_and_ctx_and_adds_a_code():
    with pytest.raises(ValidationError) as caught:
        _Item.model_validate({"name": "ab", "count": 0})
    original = caught.value.errors(include_url=False)
    assert all("input" in entry and "ctx" in entry for entry in original)

    response = await handle_validation_error(_request(), RequestValidationError(original))

    assert response.status_code == 422
    body = json.loads(bytes(response.body))
    assert body["code"] == "validation_error"
    assert body["detail"] == [{"type": e["type"], "loc": list(e["loc"]), "msg": e["msg"]} for e in original]


@pytest.mark.anyio
async def test_a_foreign_exception_is_not_swallowed_by_the_validation_handler():
    with pytest.raises(ValueError, match="x"):
        await handle_validation_error(_request(), ValueError("x"))
