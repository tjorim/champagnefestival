"""Mocked local-service drafts: authorization, bounds, failures and no writes."""

import asyncio
import json

import httpx
import pytest
from sqlalchemy import func, select

from app.auth import require_admin
from app.config import settings
from app.main import app
from app.models import AuditEntry, ExhibitorChange, OutboxJob
from app.services import exhibitor_translation as translation
from tests import test_my_exhibitors
from tests.conftest import ADMIN_HEADERS

manager = test_my_exhibitors.manager
login = test_my_exhibitors.login
BODY = {"text": "Hallo", "source": "nl", "target": "en"}


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setattr(settings, "translation_service_url", "http://translation.local")
    monkeypatch.setattr(settings, "translation_languages", "nl,en")
    monkeypatch.setattr(translation, "_worker", asyncio.Lock())
    calls = []
    real_client = httpx.AsyncClient

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"translatedText": "Hello"})

    def use_handler(callback):
        def factory(**kwargs):
            assert kwargs["timeout"] >= 60
            assert kwargs["trust_env"] is False
            return real_client(**kwargs, transport=httpx.MockTransport(callback))

        monkeypatch.setattr(translation.httpx, "AsyncClient", factory)

    use_handler(handler)
    return calls, use_handler


async def test_admin_draft_is_stateless_and_repeatable(client, db_session, service):
    response = await client.get("/api/exhibitors/translation", headers=ADMIN_HEADERS)
    assert response.json() == {"languages": ["nl", "en"]}
    assert response.headers["cache-control"] == "no-store"
    for _ in range(2):
        response = await client.post("/api/exhibitors/translation", json=BODY, headers=ADMIN_HEADERS)
        assert response.json() == {"text": "Hello"}
    for model in (ExhibitorChange, AuditEntry, OutboxJob):
        assert await db_session.scalar(select(func.count()).select_from(model)) == 0
    assert str(service[0][0].url) == "http://translation.local/translate"
    assert json.loads(service[0][0].content) == {"q": "Hallo", "source": "nl", "target": "en", "format": "text"}


async def test_manager_draft_checks_live_ownership(client, db_session, manager, service):
    await login(client, manager)
    row_id, other_id = manager[1][0].id, manager[1][2].id
    url = f"/api/me/exhibitors/{row_id}/translation"
    assert (await client.get(url)).json() == {"languages": ["nl", "en"]}
    assert (await client.post(url, json=BODY)).json() == {"text": "Hello"}
    assert (await client.post(f"/api/me/exhibitors/{other_id}/translation", json=BODY)).status_code == 404
    assert await db_session.scalar(select(func.count()).select_from(ExhibitorChange)) == 0
    await db_session.refresh(manager[0])
    manager[0].email = "revoked@example.com"
    await db_session.commit()
    assert (await client.post(url, json=BODY)).status_code == 404
    assert len(service[0]) == 1


@pytest.mark.parametrize(
    "body",
    [
        {**BODY, "text": "x" * 601},
        {**BODY, "text": " "},
        {**BODY, "target": "fr"},
        {**BODY, "target": "nl"},
        {**BODY, "source": "de"},
    ],
)
async def test_invalid_requests_never_contact_service(client, service, body):
    assert (await client.post("/api/exhibitors/translation", json=body)).status_code == 422
    assert not service[0]


async def test_feature_off(client, service, monkeypatch):
    monkeypatch.setattr(settings, "translation_service_url", "")
    assert (await client.get("/api/exhibitors/translation")).json() == {"languages": []}
    assert (await client.post("/api/exhibitors/translation", json=BODY)).status_code == 503
    assert not service[0]


@pytest.mark.parametrize(
    "failure,expected", [("timeout", 504), ("down", 503), ("http", 503), ("invalid", 503), ("long", 503)]
)
async def test_failure_is_sanitized_and_worker_released(client, service, failure, expected):
    def handler(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("secret description", request=request)
        if failure == "down":
            raise httpx.ConnectError("secret description", request=request)
        if failure == "http":
            return httpx.Response(500, text="secret description")
        return httpx.Response(200, json={"translatedText": "x" * 601} if failure == "long" else ["secret description"])

    service[1](handler)
    response = await client.post("/api/exhibitors/translation", json=BODY)
    assert response.status_code == expected
    assert "secret description" not in response.text
    assert not translation._worker.locked()


async def test_rate_limit(client, service):
    for _ in range(5):
        assert (await client.post("/api/exhibitors/translation", json=BODY)).status_code == 200
    response = await client.post("/api/exhibitors/translation", json=BODY)
    assert response.status_code == 429
    assert response.headers["retry-after"] == "600"
    assert len(service[0]) == 5


async def test_concurrency_rejects_burst(service):
    started, release = asyncio.Event(), asyncio.Event()

    async def handler(request):
        started.set()
        await release.wait()
        return httpx.Response(200, json={"translatedText": "Hello"})

    service[1](handler)
    first = asyncio.create_task(translation.suggest(translation.TranslationRequest.model_validate(BODY), "first"))
    await started.wait()
    try:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await translation.suggest(translation.TranslationRequest.model_validate(BODY), "second")
        assert exc.value.status_code == 503
    finally:
        release.set()
        await first


@pytest.mark.parametrize("roles", [[], ["visitor"], ["volunteer"], ["member"]])
async def test_non_admin_is_rejected(client, service, monkeypatch, roles):
    async def decode(_credentials):
        return {"sub": "non-admin", "realm_access": {"roles": roles}}

    app.dependency_overrides.pop(require_admin)
    monkeypatch.setattr("app.auth._decode_or_401", decode)
    for method in ("GET", "POST"):
        response = await client.request(
            method,
            "/api/exhibitors/translation",
            headers={"Authorization": "Bearer test"},
            **({"json": BODY} if method == "POST" else {}),
        )
        assert response.status_code == 403
    assert not service[0]


async def test_unauthenticated_and_non_manager(client, manager, service):
    app.dependency_overrides.pop(require_admin)
    assert (await client.post("/api/exhibitors/translation", json=BODY)).status_code == 401
    row_id = manager[1][0].id
    assert (await client.post(f"/api/me/exhibitors/{row_id}/translation", json=BODY)).status_code == 401
    await login(client, manager, email="unknown@example.com")
    assert (await client.post(f"/api/me/exhibitors/{row_id}/translation", json=BODY)).status_code == 404
    assert not service[0]
