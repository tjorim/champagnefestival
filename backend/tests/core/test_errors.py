"""``app.core.errors``: the handlers that give failures nothing else answers the shared JSON body."""

from __future__ import annotations

import logging

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.errors import handle_unhandled_exception


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

    return app


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
