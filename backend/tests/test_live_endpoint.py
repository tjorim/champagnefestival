"""Tests for the SSE live-update stream endpoint.

Auth/routing tests use httpx (auth check happens before streaming, so the
response returns immediately).  SSE content tests call _sse_generator()
directly because httpx's ASGITransport buffers the full response body
before returning, which would hang on an infinite SSE stream.
"""

from __future__ import annotations

import json

from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.auth import require_volunteer
from app.live import live_bus
from app.live.mapping import check_in_changed, seating_changed
from app.main import app
from app.routers.live import _SSE_HEADERS, _sse_generator, get_heartbeat_interval

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _http_client(*, auth_override) -> AsyncClient:
    app.dependency_overrides[require_volunteer] = auth_override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _reset_auth():
    app.dependency_overrides.pop(require_volunteer, None)
    app.dependency_overrides.pop(get_heartbeat_interval, None)


# ---------------------------------------------------------------------------
# Auth tests (via httpx — auth failure returns immediately, no infinite stream)
# ---------------------------------------------------------------------------


async def test_live_stream_401_without_auth():
    def reject():
        raise HTTPException(status_code=401, detail="Not authenticated")

    async with _http_client(auth_override=reject) as c:
        r = await c.get("/api/live/stream")
    _reset_auth()
    assert r.status_code == 401


async def test_live_stream_403_without_volunteer_role():
    def reject():
        raise HTTPException(status_code=403, detail="Forbidden")

    async with _http_client(auth_override=reject) as c:
        r = await c.get("/api/live/stream")
    _reset_auth()
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Header tests (unit — check the dict that StreamingResponse receives)
# ---------------------------------------------------------------------------


def test_sse_headers_cache_control():
    assert _SSE_HEADERS["Cache-Control"] == "no-cache"


def test_sse_headers_x_accel_buffering():
    assert _SSE_HEADERS["X-Accel-Buffering"] == "no"


def test_sse_headers_connection():
    assert _SSE_HEADERS["Connection"] == "keep-alive"


# ---------------------------------------------------------------------------
# Generator tests — call _sse_generator directly, bypassing HTTP transport
# ---------------------------------------------------------------------------


async def test_sse_generator_sends_ready_event():
    gen = _sse_generator(edition_id=None, event_id=None, heartbeat_interval=5.0)
    try:
        chunk = await gen.__anext__()
    finally:
        await gen.aclose()

    assert "event: ready" in chunk
    assert '"ok":true' in chunk


async def test_sse_generator_sends_keepalive():
    gen = _sse_generator(edition_id=None, event_id=None, heartbeat_interval=0.05)
    try:
        _ready = await gen.__anext__()  # consume ready event
        keepalive = await gen.__anext__()  # next chunk should be a keepalive
    finally:
        await gen.aclose()

    assert keepalive == ": keepalive\n\n"


async def test_sse_generator_delivers_published_event():
    event = check_in_changed(registration_id="reg-test", event_id="ev-test")

    gen = _sse_generator(edition_id=None, event_id=None, heartbeat_interval=5.0)
    try:
        _ready = await gen.__anext__()
        await live_bus.publish(event)
        chunk = await gen.__anext__()
    finally:
        await gen.aclose()

    assert "event: invalidate" in chunk
    data_line = next(line for line in chunk.splitlines() if line.startswith("data: "))
    payload = json.loads(data_line[6:])
    assert payload["topic"] == "check_in"
    assert payload["action"] == "updated"
    assert payload["scope"]["registration_id"] == "reg-test"
    assert ["admin", "registrations"] in payload["keys"]


async def test_sse_generator_scope_filter_delivers_matching():
    event = seating_changed(registration_id="reg-1", table_id="tbl-1", edition_id="ed-match")

    gen = _sse_generator(edition_id="ed-match", event_id=None, heartbeat_interval=5.0)
    try:
        _ready = await gen.__anext__()
        await live_bus.publish(event)
        chunk = await gen.__anext__()
    finally:
        await gen.aclose()

    data_line = next(line for line in chunk.splitlines() if line.startswith("data: "))
    payload = json.loads(data_line[6:])
    assert payload["topic"] == "seating"


async def test_sse_generator_scope_filter_skips_non_matching():
    """Non-matching event must be skipped; keepalive arrives instead."""
    non_matching = seating_changed(edition_id="ed-other", registration_id="reg-1")
    matching = check_in_changed(registration_id="reg-2", edition_id="ed-target")

    gen = _sse_generator(edition_id="ed-target", event_id=None, heartbeat_interval=0.5)
    try:
        _ready = await gen.__anext__()
        await live_bus.publish(non_matching)
        # Give the loop a chance to process then publish the matching event
        await live_bus.publish(matching)
        chunk = await gen.__anext__()
    finally:
        await gen.aclose()

    # The first yielded chunk must be the matching event, not the non-matching one.
    assert "check_in" in chunk
    assert "seating" not in chunk


async def test_sse_generator_event_id_filter():
    matching = check_in_changed(registration_id="reg-1", event_id="ev-target")
    non_matching = check_in_changed(registration_id="reg-2", event_id="ev-other")

    gen = _sse_generator(edition_id=None, event_id="ev-target", heartbeat_interval=5.0)
    try:
        _ready = await gen.__anext__()
        await live_bus.publish(non_matching)
        await live_bus.publish(matching)
        chunk = await gen.__anext__()
    finally:
        await gen.aclose()

    data_line = next(line for line in chunk.splitlines() if line.startswith("data: "))
    payload = json.loads(data_line[6:])
    assert payload["scope"]["registration_id"] == "reg-1"


async def test_sse_generator_keepalive_not_starved_by_filtered_events():
    """Keepalive must be sent even when filtered events arrive continuously.

    Regression test for the heartbeat-starvation bug: if non-matching events
    keep arriving before the timeout, asyncio.wait_for() keeps returning them
    and TimeoutError is never raised, so the keepalive is never sent.  The fix
    tracks elapsed time and adjusts the wait_for timeout on each iteration.
    """
    non_matching = seating_changed(edition_id="ed-other", registration_id="reg-flood")

    gen = _sse_generator(edition_id="ed-target", event_id=None, heartbeat_interval=0.05)
    try:
        _ready = await gen.__anext__()
        # Flood with 20 non-matching events — all should be filtered, keepalive
        # must still arrive within ~heartbeat_interval.
        for _ in range(20):
            await live_bus.publish(non_matching)
        chunk = await gen.__anext__()
    finally:
        await gen.aclose()

    assert chunk == ": keepalive\n\n"


async def test_sse_generator_cleanup_on_close():
    """Bus must have no subscribers after the generator is closed."""
    initial_count = live_bus.subscriber_count

    gen = _sse_generator(edition_id=None, event_id=None, heartbeat_interval=5.0)
    _ready = await gen.__anext__()
    assert live_bus.subscriber_count == initial_count + 1

    await gen.aclose()
    assert live_bus.subscriber_count == initial_count
