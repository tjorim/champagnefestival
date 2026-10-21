import logging
import re

import pytest
from fastapi import Depends, FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from app import request_timing
from app.main import app as champagnefestival_app
from app.request_timing import RequestTimingMiddleware
from tests.conftest import TEST_DATABASE_URL

# Queries run in SQLAlchemy's asyncio greenlets on asyncpg, as in production.
engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
TIMING = re.compile(r'^app;dur=\d+\.\d, db;desc="(\d+) queries";dur=\d+\.\d$')


async def one_query():
    # An async generator dependency, like the database session.
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
        yield


def build_app() -> FastAPI:
    application = FastAPI()

    @application.get("/items/{item_id}")
    async def read_item(item_id: int, _query: None = Depends(one_query)) -> dict[str, int]:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            await connection.execute(text("SELECT 2"))
        return {"item_id": item_id}

    @application.get("/stream")
    def stream() -> StreamingResponse:
        return StreamingResponse(iter([b"a", b"b"]), media_type="text/plain")

    @application.get("/boom")
    def boom() -> None:
        raise RuntimeError("boom")

    application.mount("/mcp", Starlette(routes=[Route("/", lambda _request: PlainTextResponse("mcp"))]))
    application.mount("/raw", PlainTextResponse("raw"))
    application.add_middleware(RequestTimingMiddleware)
    return application


@pytest.fixture
def client() -> TestClient:
    return TestClient(build_app(), raise_server_exceptions=False)


@pytest.fixture
def slow(monkeypatch) -> None:
    monkeypatch.setattr(request_timing, "SLOW_REQUEST_MS", 0.0)


def queries(response) -> int:
    match = TIMING.match(response.headers["server-timing"])
    assert match, response.headers["server-timing"]
    return int(match.group(1))


def test_server_timing_counts_queries_from_endpoints_and_dependencies(client) -> None:
    response = client.get("/items/42")

    assert response.status_code == 200
    assert queries(response) == 3
    assert queries(client.get("/stream")) == 0


def test_fast_requests_are_not_logged(client, caplog) -> None:
    with caplog.at_level(logging.WARNING, logger=request_timing.__name__):
        client.get("/items/42")

    assert caplog.records == []


def test_slow_requests_log_the_route_template_never_the_raw_path(client, slow, caplog) -> None:
    with caplog.at_level(logging.WARNING, logger=request_timing.__name__):
        client.get("/items/42")
        client.get("/private/secret-token")
        client.get("/mcp/")
        client.get("/raw/anything/secret")
        client.get("/boom")

    messages = [record.getMessage() for record in caplog.records]
    assert re.fullmatch(
        r"slow request method=GET route=/items/\{item_id\} status=200 duration_ms=\d+ queries=3 db_ms=\d+",
        messages[0],
    )
    assert "route=unmatched status=404" in messages[1]
    # Starlette versions differ on whether a mounted app's own route is set.
    assert re.search(r"route=/mcp/\*? status=200", messages[2])
    assert "route=/raw/* status=200" in messages[3]
    assert "route=/boom status=500" in messages[4]
    assert not any("42" in message.split("duration_ms")[0] or "secret" in message for message in messages)


def test_streamed_responses_are_passed_through(client) -> None:
    response = client.get("/stream")

    assert response.text == "ab"
    assert "server-timing" in response.headers


def test_lifespan_and_other_scopes_pass_through() -> None:
    with TestClient(build_app()) as client:
        assert client.get("/items/1").status_code == 200


def test_the_champagnefestival_api_reports_server_timing() -> None:
    response = TestClient(champagnefestival_app).get("/api/health/liveness")

    assert response.status_code == 200
    assert queries(response) >= 0
