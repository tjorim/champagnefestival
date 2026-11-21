"""Error contract of the assembled app: one body shape, stable codes, no stack traces and no secrets.

``tests/test_api_error_codes.py`` covers the ``ApiHTTPException`` handler and the service-error mapping in isolation;
these tests go through ``app.main:app`` so a middleware or a router that changes the shape is caught. The wording of
``detail`` is not part of the contract, ``code`` is.

The body of a failure is ``{"detail": str, "code": str}`` (clients translate the code): the app's own code when it
raised the failure with one, otherwise a code from the status (``not_found``, ``method_not_allowed``, ``unauthorized``,
``forbidden``, ``bad_request``, else ``http_<status>``) for what the framework or an uncoded service error produces,
and ``internal_error`` for an unhandled exception. A validation failure is FastAPI's list of field errors, without the
submitted values, plus ``code: validation_error``. The general rate limiter's 429 also keeps ``error``, which existing
clients read: ``{"error": str, "detail": str, "code": "rate_limited"}``.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from limits import parse

from app.core.auth import require_admin
from app.db.session import get_db
from app.main import app, general_rate_limiter

TRACE_MARKERS = ("Traceback", 'File "', "site-packages", "/app/", "sqlalchemy", "asyncpg", "aiosqlite")
SECRET = "secret-token-value"


def assert_coded_error(body: dict) -> None:
    """Every failure the app raises with a stable code is ``{"detail": str, "code": str}``."""
    assert set(body) == {"detail", "code"}
    assert isinstance(body["detail"], str)
    assert body["detail"]
    assert body["code"] == body["code"].lower()
    assert body["code"].replace("_", "").isalnum()


@pytest.fixture()
async def real_auth_client(db_session):
    """A client that goes through the real authentication dependencies (no admin override)."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_app_raised_failures_use_one_shape_with_stable_codes(client):
    responses = (
        (await client.get("/uploads/signage/not-a-valid-name"), 404, "signage_asset_not_found"),
        (await client.get("/uploads/signage/" + "a" * 32 + ".jpg"), 404, "signage_asset_not_found"),
    )
    for response, status, code in responses:
        assert response.status_code == status
        assert response.headers["content-type"] == "application/json"
        assert_coded_error(response.json())
        assert response.json()["code"] == code


@pytest.mark.anyio
async def test_uncoded_service_errors_get_a_code_from_their_status(client):
    response = await client.get("/api/events/999999")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert_coded_error(response.json())
    assert response.json()["code"] == "not_found"


@pytest.mark.anyio
async def test_framework_failures_are_json_with_a_detail_and_a_status_code(client):
    # Unknown paths and wrong methods are answered by Starlette before any app handler; the code comes from the status
    # and the headers (``Allow``) are kept.
    for response, status, code in (
        (await client.get("/api/does-not-exist"), 404, "not_found"),
        (await client.delete("/api/health"), 405, "method_not_allowed"),
    ):
        assert response.status_code == status
        assert response.headers["content-type"] == "application/json"
        assert_coded_error(response.json())
        assert response.json()["code"] == code
    assert "GET" in (await client.delete("/api/health")).headers["allow"]


@pytest.mark.anyio
async def test_missing_and_invalid_credentials_are_401_with_a_code(real_auth_client):
    missing = await real_auth_client.get("/api/registrations")
    invalid = await real_auth_client.get("/api/registrations", headers={"Authorization": f"Bearer {SECRET}"})

    for response in (missing, invalid):
        assert response.status_code in (401, 403)
        assert response.headers["content-type"] == "application/json"
        assert_coded_error(response.json())
        assert response.json()["code"] == {401: "unauthorized", 403: "forbidden"}[response.status_code]
        assert SECRET not in response.text
    assert invalid.status_code == 401
    assert invalid.headers["www-authenticate"] == "Bearer"


@pytest.mark.anyio
async def test_validation_failures_list_the_field_errors_without_the_submitted_values(client):
    # ``detail`` stays FastAPI's list (the frontend reads ``loc`` to mark fields) and gains ``code`` like every other
    # failure; ``input`` and ``ctx`` are dropped because they echo what the caller sent.
    response = await client.post("/api/events", json={"title": SECRET, "unknown_field": [SECRET]})

    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"detail", "code"}
    assert body["code"] == "validation_error"
    assert body["detail"]
    for entry in body["detail"]:
        assert set(entry) == {"type", "loc", "msg"}
        assert isinstance(entry["loc"], list)
    assert SECRET not in response.text


@pytest.mark.anyio
async def test_malformed_json_is_a_validation_error_that_does_not_echo_the_body(client):
    response = await client.post(
        "/api/events", content=f'{{"title": "{SECRET}"', headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert SECRET not in response.text


@pytest.mark.anyio
async def test_the_rate_limit_keeps_error_and_adds_detail_and_a_code(client, monkeypatch):
    # ``error`` stays for the clients that read it; ``detail`` (the same text) and ``code`` make it the shared shape.
    monkeypatch.setattr(general_rate_limiter, "limit", parse("1/minute"))
    transport = ASGITransport(app=app, client=("203.0.113.20", 1234))
    async with AsyncClient(transport=transport, base_url="http://test") as limited:
        assert (await limited.get("/api/health")).status_code == 200
        response = await limited.get("/api/health")

    assert response.status_code == 429
    body = response.json()
    assert set(body) == {"error", "detail", "code"}
    assert body["detail"] == body["error"]
    assert body["code"] == "rate_limited"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["retry-after"]
    assert response.headers["x-request-id"]


@pytest.mark.anyio
async def test_failures_never_carry_a_stack_trace_or_a_secret(real_auth_client):
    responses = (
        await real_auth_client.get("/api/does-not-exist"),
        await real_auth_client.get("/api/events/999999"),
        await real_auth_client.get("/uploads/signage/" + SECRET),
        await real_auth_client.get("/api/registrations", headers={"Authorization": f"Bearer {SECRET}"}),
    )
    for response in responses:
        assert response.status_code >= 400
        assert SECRET not in response.text
        for marker in TRACE_MARKERS:
            assert marker not in response.text


@pytest.mark.anyio
async def test_an_unhandled_exception_answers_a_json_500_without_leaking_its_cause(db_session, caplog):
    # Raised below ``RequestIdMiddleware``: the middleware logs the traceback server side, reports it to Sentry and
    # answers with the JSON body and the request id.
    async def failing():
        raise RuntimeError("secret-token postgresql://user:password@db/champagne")
        yield  # pragma: no cover

    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db] = failing
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
        ) as c:
            response = await c.get("/api/events/1", headers={"X-Request-ID": "trace-me-1"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/json"
    assert response.headers["x-request-id"] == "trace-me-1"
    assert response.json() == {"detail": "Internal server error", "code": "internal_error"}
    for secret in ("secret-token", "password", "postgresql", "RuntimeError"):
        assert secret not in response.text
    for marker in TRACE_MARKERS:
        assert marker not in response.text
    # The cause is still logged with its traceback, on the server.
    assert any(record.exc_info and "secret-token" in str(record.exc_info[1]) for record in caplog.records)
