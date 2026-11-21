"""Error contract of the assembled app: one body shape, stable codes, no stack traces and no secrets.

``tests/test_api_error_codes.py`` covers the ``ApiHTTPException`` handler and the service-error mapping in isolation;
these tests go through ``app.main:app`` so a middleware or a router that changes the shape is caught. The wording of
``detail`` is not part of the contract, ``code`` is.

The body of a failure is ``{"detail": str, "code": str}`` when the app raised it with a stable code (clients translate
the code). Failures the framework or an uncoded service error produces carry ``detail`` only, validation failures
FastAPI's list of field errors, and the general rate limiter answers ``{"error": str}``. Those deviations are pinned
below (not changed here: clients read them) so that changing one is a decision.
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
async def test_uncoded_service_errors_carry_a_detail_only(client):
    response = await client.get("/api/events/999999")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert set(response.json()) == {"detail"}
    assert isinstance(response.json()["detail"], str)


@pytest.mark.anyio
async def test_framework_failures_are_json_with_a_detail(client):
    # Unknown paths and wrong methods are answered by Starlette before any app handler: ``detail`` only, no ``code``
    # (recorded as a follow-up; adding one changes the body clients see).
    for response, status in (
        (await client.get("/api/does-not-exist"), 404),
        (await client.delete("/api/health"), 405),
    ):
        assert response.status_code == status
        assert response.headers["content-type"] == "application/json"
        assert set(response.json()) == {"detail"}
        assert isinstance(response.json()["detail"], str)


@pytest.mark.anyio
async def test_missing_and_invalid_credentials_are_401_with_a_detail(real_auth_client):
    missing = await real_auth_client.get("/api/registrations")
    invalid = await real_auth_client.get("/api/registrations", headers={"Authorization": f"Bearer {SECRET}"})

    for response in (missing, invalid):
        assert response.status_code in (401, 403)
        assert response.headers["content-type"] == "application/json"
        assert set(response.json()) == {"detail"}
        assert SECRET not in response.text
    assert invalid.status_code == 401
    assert invalid.headers["www-authenticate"] == "Bearer"


@pytest.mark.anyio
async def test_validation_failures_list_the_field_errors(client):
    response = await client.post("/api/events", json={})

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert errors
    assert all({"type", "loc", "msg"} <= set(entry) for entry in errors)


@pytest.mark.anyio
async def test_the_rate_limit_answers_error_not_detail(client, monkeypatch):
    # The one body without ``detail``: kept because clients read ``error`` (recorded as a follow-up).
    monkeypatch.setattr(general_rate_limiter, "limit", parse("1/minute"))
    transport = ASGITransport(app=app, client=("203.0.113.20", 1234))
    async with AsyncClient(transport=transport, base_url="http://test") as limited:
        assert (await limited.get("/api/health")).status_code == 200
        response = await limited.get("/api/health")

    assert response.status_code == 429
    assert set(response.json()) == {"error"}
    assert response.headers["cache-control"] == "no-store"
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
