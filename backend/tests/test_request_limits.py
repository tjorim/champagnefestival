"""Cross-app contract: stable buckets, trusted clients and useful 429 headers."""

from uuid import UUID

import pytest
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.responses import JSONResponse, PlainTextResponse, StreamingResponse
from starlette.routing import Route

from app.request_limits import (
    RateLimitExceeded,
    RateLimitHeadersMiddleware,
    RequestRateLimiter,
    get_client_ip,
)


def build_app(limit="2/minute"):
    limiter = RequestRateLimiter(limit)

    async def enforce(request: Request):
        limiter.check(request)

    app = FastAPI(dependencies=[Depends(enforce)])
    app.add_middleware(RateLimitHeadersMiddleware, owner=app, check_before_body=enforce)

    @app.exception_handler(RateLimitExceeded)
    async def exceeded(request, exc):
        return JSONResponse({"error": f"Rate limit exceeded: {exc.detail}"}, status_code=429, headers=exc.headers)

    @app.middleware("http")
    async def outer_observability(request, call_next):
        return await call_next(request)

    router = APIRouter()

    @router.api_route("/items/{item_id}", methods=["GET", "POST"])
    async def item(item_id: str):
        return {"id": item_id}

    @router.get("")
    async def root():
        return {"ok": True}

    @router.post("/json")
    async def json_body(payload: dict):
        return payload

    @router.get("/raw")
    async def raw():
        return PlainTextResponse("ok")

    @router.get("/stream")
    async def stream():
        return StreamingResponse(iter([b"ok"]))

    @router.get("/private")
    async def private():
        raise HTTPException(401)

    @router.get("/backoff")
    async def backoff():
        raise HTTPException(429, headers={"Retry-After": "600"})

    @router.get("/validated")
    async def validated(value: int):
        return {"value": value}

    @router.get("/health")
    @limiter.exempt
    async def health():
        return {"ok": True}

    @router.get("/files/{rest:path}")
    async def file(rest: str):
        return {"rest": rest}

    @router.get("/uuids/{value:uuid}")
    async def uuid(value: UUID):
        return {"value": str(value)}

    parent = APIRouter()
    parent.include_router(router, prefix="/nested")
    app.include_router(parent, prefix="/api")
    app.include_router(router, prefix="/other")
    app.mount("/mcp", Starlette(routes=[Route("/", lambda request: PlainTextResponse("ok"))]))
    mounted = FastAPI()

    @mounted.post("/json")
    async def mounted_json(payload: dict):
        return payload

    app.mount("/json-mcp", mounted)
    return app, limiter


def test_ids_and_methods_share_bucket_but_inclusion_prefixes_do_not():
    app, _ = build_app()
    client = TestClient(app)
    assert client.get("/api/nested/items/a").status_code == 200
    assert client.post("/api/nested/items/b").status_code == 200
    rejected = client.get("/api/nested/items/c")
    assert rejected.status_code == 429
    assert rejected.json() == {"error": "Rate limit exceeded: 2 per 1 minute"}
    assert 1 <= int(rejected.headers["retry-after"]) <= 60
    assert rejected.headers["x-ratelimit-remaining"] == "0"
    assert client.get("/other/items/c").status_code == 200


@pytest.mark.parametrize("path,status", [("raw", 200), ("stream", 200), ("private", 401), ("validated", 422)])
def test_headers_survive_explicit_responses_and_errors(path, status):
    app, _ = build_app()
    client = TestClient(app)
    response = client.get(f"/other/{path}")
    assert response.status_code == status
    assert response.headers["x-ratelimit-limit"] == "2"
    assert response.headers["x-ratelimit-remaining"] == "1"
    assert int(response.headers["retry-after"]) >= 1
    assert client.get(f"/other/{path}").status_code == status
    assert client.get(f"/other/{path}").status_code == 429


def test_exemptions_mounts_disabled_policy_and_reset():
    app, limiter = build_app("1/minute")
    client = TestClient(app)
    for _ in range(3):
        for path in ["/other/health", "/mcp/"]:
            response = client.get(path)
            assert response.status_code == 200
            assert "x-ratelimit-limit" not in response.headers
    assert client.get("/other/raw").status_code == 200
    assert client.get("/other/raw").status_code == 429
    limiter.reset()
    assert client.get("/other/raw").status_code == 200
    limiter.enabled = False
    assert client.get("/other/raw").status_code == 200


def test_greedy_path_and_uuid_converters_have_stable_buckets():
    app, _ = build_app("1/minute")
    client = TestClient(app)
    assert client.get("/other/files/a/b").status_code == 200
    assert client.get("/other/files/c/d").status_code == 429
    assert client.get("/api/nested/files/c/d").status_code == 200
    assert client.get("/other/uuids/AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA").status_code == 200
    assert client.get("/other/uuids/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").status_code == 429


def peer(address, forwarded=None):
    return Request(
        {
            "type": "http",
            "client": (address, 1),
            "headers": [] if forwarded is None else [(b"x-real-ip", forwarded.encode())],
        }
    )


def test_client_keys_validate_forwarded_addresses_and_bound_ipv6_rotation():
    assert get_client_ip(peer("8.8.8.8", "1.1.1.1")) == "8.8.8.8"
    assert get_client_ip(peer("10.0.0.1", "not an IP")) == "10.0.0.1"
    assert get_client_ip(peer("10.0.0.1", "::ffff:1.1.1.1")) == "1.1.1.1"
    assert get_client_ip(peer("10.0.0.1", "2001:db8:1:2::1")) == get_client_ip(peer("10.0.0.1", "2001:db8:1:2::ffff"))


def test_clients_have_separate_buckets():
    app, _ = build_app("1/minute")
    a = TestClient(app, client=("8.8.8.8", 1))
    b = TestClient(app, client=("1.1.1.1", 1))
    assert a.get("/other/raw").status_code == 200
    assert a.get("/other/raw").status_code == 429
    assert b.get("/other/raw").status_code == 200


def test_multiple_windows_report_the_longest_exhausted_retry_and_expire(monkeypatch):
    import time

    now = [1_000_000.0]
    monkeypatch.setattr(time, "time", lambda: now[0])
    app, _ = build_app("1/second;2/minute")
    client = TestClient(app)
    assert client.get("/other/raw").status_code == 200
    assert client.get("/other/raw").status_code == 429
    response = client.get("/other/raw")
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) >= 60
    now[0] += 61
    assert client.get("/other/raw").status_code == 200


@pytest.mark.parametrize("value", ["often", "0/minute"])
def test_invalid_configuration_fails_at_startup(value):
    with pytest.raises(ValueError):
        RequestRateLimiter(value)


def test_empty_router_path_keeps_its_inclusion_prefix():
    app, _ = build_app("1/minute")
    client = TestClient(app)
    assert client.get("/other").status_code == 200
    assert client.get("/other").status_code == 429
    assert client.get("/api/nested").status_code == 200


def test_purpose_specific_429_keeps_its_own_backoff():
    app, _ = build_app()
    response = TestClient(app).get("/other/backoff")
    assert response.status_code == 429
    assert response.headers["retry-after"] == "600"
    assert response.headers["cache-control"] == "no-store"
    assert "x-ratelimit-remaining" not in response.headers


def test_malformed_json_consumes_budget_and_valid_json_is_charged_once():
    app, _ = build_app()
    client = TestClient(app)
    invalid = client.post("/other/json", content="{", headers={"Content-Type": "application/json"})
    assert invalid.status_code == 422
    assert invalid.headers["x-ratelimit-remaining"] == "1"
    valid = client.post("/other/json", json={})
    assert valid.status_code == 200
    assert valid.headers["x-ratelimit-remaining"] == "0"
    exhausted = client.post("/other/json", content="{", headers={"Content-Type": "application/json"})
    assert exhausted.status_code == 429
    assert int(exhausted.headers["retry-after"]) > 0


def test_exhausted_json_request_is_rejected_before_reading_body():
    import asyncio

    from httpx import ASGITransport, AsyncClient

    async def run():
        app, _ = build_app("1/minute")
        consumed = []

        async def body():
            consumed.append(True)
            yield b"{"

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.post("/other/json", json={})).status_code == 200
            response = await client.post("/other/json", content=body(), headers={"Content-Type": "application/json"})
            assert response.status_code == 429
            assert consumed == []

    asyncio.run(run())


def test_real_app_malformed_json_is_limited_before_decoding(monkeypatch):
    from limits import parse_many

    from app.main import app

    limiter = app.state.limiter
    limiter.reset()
    monkeypatch.setattr(limiter, "enabled", True)
    monkeypatch.setattr(limiter, "limits", parse_many("2/minute"))
    path = next(
        path
        for path, operations in app.openapi()["paths"].items()
        if "{" not in path
        and "application/json" in operations.get("post", {}).get("requestBody", {}).get("content", {})
    )
    client = TestClient(app, base_url="http://localhost")
    responses = [client.post(path, content="{", headers={"Content-Type": "application/json"}) for _ in range(3)]
    assert [response.status_code for response in responses] == [422, 422, 429]
    assert responses[0].headers["x-ratelimit-remaining"] == "1"
    assert int(responses[-1].headers["retry-after"]) > 0


def test_mounted_json_app_does_not_inherit_parent_body_admission():
    app, _ = build_app("1/minute")
    client = TestClient(app)
    for _ in range(3):
        response = client.post("/json-mcp/json", content="{", headers={"Content-Type": "application/json"})
        assert response.status_code == 422
        assert "x-ratelimit-limit" not in response.headers


def test_method_mismatch_does_not_consume_a_route_allowance():
    app, _ = build_app("1/minute")
    client = TestClient(app)
    for _ in range(3):
        response = client.put("/other/json", json={})
        assert response.status_code == 405
        assert "x-ratelimit-limit" not in response.headers
    assert client.post("/other/json", json={}).status_code == 200
