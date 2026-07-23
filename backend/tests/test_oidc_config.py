from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app import oidc_config as oc
from app.config import settings
from app.main import app
from app.routers import auth


@pytest.mark.asyncio
async def test_decode_token_dev_bypass_returns_fixed_claims(monkeypatch) -> None:
    monkeypatch.setattr(oc.settings, "dev_auth_bypass_token", "test-bypass-token")

    claims = await oc.decode_token("test-bypass-token")

    assert claims == oc._DEV_BYPASS_CLAIMS
    assert set(claims["realm_access"]["roles"]) == {"admin", "volunteer"}


@pytest.mark.asyncio
async def test_decode_token_wrong_token_does_not_trigger_bypass(monkeypatch) -> None:
    monkeypatch.setattr(oc.settings, "dev_auth_bypass_token", "test-bypass-token")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", "")
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "")

    with pytest.raises(oc.OIDCTokenError):
        await oc.decode_token("not-the-bypass-token")


@pytest.mark.asyncio
async def test_decode_token_bypass_disabled_by_default(monkeypatch) -> None:
    monkeypatch.setattr(oc.settings, "dev_auth_bypass_token", "")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", "")
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "")

    with pytest.raises(oc.OIDCTokenError):
        await oc.decode_token("test-bypass-token")


@pytest.mark.asyncio
async def test_resolve_jwks_uri_requires_issuer_without_override(monkeypatch) -> None:
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", "")

    with pytest.raises(oc.OIDCTokenError, match="OIDC_ISSUER_URL is not configured"):
        await oc._resolve_jwks_uri()


def _mock_discovery_client(handler):
    """Return a factory producing an httpx client backed by a mock transport."""
    return lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_discovered_provider_urls(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/champagnefestival"
    monkeypatch.setattr(settings, "oidc_issuer_url", issuer + "/")
    monkeypatch.setattr(auth, "_config_cache", {})

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == f"{issuer}/.well-known/openid-configuration"
        return httpx.Response(
            200,
            content=json.dumps(
                {
                    "issuer": issuer,
                    "authorization_endpoint": f"{issuer}/protocol/openid-connect/auth",
                    "token_endpoint": f"{issuer}/protocol/openid-connect/token",
                }
            ),
        )

    monkeypatch.setattr(auth, "_http_client", _mock_discovery_client(handler))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 200
    assert response.json() == {
        "issuer": issuer,
        "authorization_url": f"{issuer}/protocol/openid-connect/auth",
        "token_url": f"{issuer}/protocol/openid-connect/token",
    }


@pytest.mark.asyncio
async def test_oidc_config_endpoint_caches_discovery(monkeypatch) -> None:
    issuer = "https://auth.example.test/application/o/champagnefestival"
    monkeypatch.setattr(settings, "oidc_issuer_url", issuer)
    monkeypatch.setattr(auth, "_config_cache", {})
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(
            200,
            content=json.dumps(
                {
                    "issuer": issuer,
                    "authorization_endpoint": f"{issuer}/authorize/",
                    "token_endpoint": f"{issuer}/token/",
                }
            ),
        )

    monkeypatch.setattr(auth, "_http_client", _mock_discovery_client(handler))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.get("/api/auth/oidc-config")
        second = await client.get("/api/auth/oidc-config")

    assert first.status_code == 200
    assert second.json() == first.json()
    assert second.json()["authorization_url"] == f"{issuer}/authorize/"
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_503_when_discovery_fails(monkeypatch) -> None:
    monkeypatch.setattr(settings, "oidc_issuer_url", "https://auth.example.test/realms/champagnefestival")
    monkeypatch.setattr(auth, "_config_cache", {})

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr(auth, "_http_client", _mock_discovery_client(handler))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 503
    assert response.json()["detail"] == "OIDC discovery failed"


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_503_when_document_incomplete(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/champagnefestival"
    monkeypatch.setattr(settings, "oidc_issuer_url", issuer)
    monkeypatch.setattr(auth, "_config_cache", {})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=json.dumps({"issuer": issuer}))

    monkeypatch.setattr(auth, "_http_client", _mock_discovery_client(handler))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 503


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_503_when_issuer_unset(monkeypatch) -> None:
    monkeypatch.setattr(settings, "oidc_issuer_url", "")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 503


def test_resolve_jwks_uri_uses_override_without_issuer(monkeypatch) -> None:
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "https://auth.example.test/jwks.json")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", "")

    assert asyncio.run(oc._resolve_jwks_uri()) == "https://auth.example.test/jwks.json"


@pytest.mark.asyncio
async def test_resolve_jwks_uri_discovers_and_caches(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/champagnefestival"
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", issuer)
    monkeypatch.setattr(oc, "_jwks_uri_cache", None)
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        assert str(request.url) == f"{issuer}/.well-known/openid-configuration"
        return httpx.Response(
            200,
            content=json.dumps({"jwks_uri": f"{issuer}/protocol/openid-connect/certs"}),
        )

    monkeypatch.setattr(oc, "_http_client", _mock_discovery_client(handler))

    first = await oc._resolve_jwks_uri()
    second = await oc._resolve_jwks_uri()

    assert first == f"{issuer}/protocol/openid-connect/certs"
    assert second == first
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_resolve_jwks_uri_raises_when_discovery_fails(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/champagnefestival"
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", issuer)
    monkeypatch.setattr(oc, "_jwks_uri_cache", None)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr(oc, "_http_client", _mock_discovery_client(handler))

    with pytest.raises(oc.OIDCTokenError, match="OIDC discovery failed"):
        await oc._resolve_jwks_uri()


@pytest.mark.asyncio
async def test_resolve_jwks_uri_raises_when_document_missing_jwks_uri(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/champagnefestival"
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", issuer)
    monkeypatch.setattr(oc, "_jwks_uri_cache", None)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=json.dumps({"issuer": issuer}))

    monkeypatch.setattr(oc, "_http_client", _mock_discovery_client(handler))

    with pytest.raises(oc.OIDCTokenError, match="OIDC discovery failed"):
        await oc._resolve_jwks_uri()


@pytest.mark.asyncio
async def test_decode_token_expired(monkeypatch) -> None:
    from jwt.exceptions import ExpiredSignatureError

    async def fake_get_jwks(**_):
        return {"keys": []}

    monkeypatch.setattr(oc, "_get_jwks", fake_get_jwks)
    monkeypatch.setattr(oc.jwt, "get_unverified_header", lambda t: {"alg": "RS256", "kid": "k1"})
    monkeypatch.setattr(oc, "_find_signing_key", lambda jwks, kid: SimpleNamespace(key=object()))

    def fake_decode(*args, **kwargs):
        raise ExpiredSignatureError("Signature has expired")

    monkeypatch.setattr(oc.jwt, "decode", fake_decode)

    with pytest.raises(oc.OIDCTokenError, match="expired"):
        await oc.decode_token("some.token.here")


@pytest.mark.asyncio
async def test_decode_token_invalid(monkeypatch) -> None:
    from jwt.exceptions import PyJWTError

    async def fake_get_jwks(**_):
        return {"keys": []}

    monkeypatch.setattr(oc, "_get_jwks", fake_get_jwks)
    monkeypatch.setattr(oc.jwt, "get_unverified_header", lambda t: {"alg": "RS256", "kid": "k1"})
    monkeypatch.setattr(oc, "_find_signing_key", lambda jwks, kid: SimpleNamespace(key=object()))

    def fake_decode(*args, **kwargs):
        raise PyJWTError("bad token")

    monkeypatch.setattr(oc.jwt, "decode", fake_decode)

    with pytest.raises(oc.OIDCTokenError, match="Token validation failed"):
        await oc.decode_token("some.token.here")


@pytest.mark.asyncio
async def test_decode_token_refreshes_jwks_on_missing_key(monkeypatch) -> None:
    call_count = {"n": 0}
    find_count = {"n": 0}
    expected_claims = {"sub": "user123", "preferred_username": "alice"}

    async def fake_get_jwks(*, force_refresh: bool = False) -> dict:
        call_count["n"] += 1
        return {"keys": []}

    monkeypatch.setattr(oc, "_get_jwks", fake_get_jwks)
    monkeypatch.setattr(oc.jwt, "get_unverified_header", lambda t: {"alg": "RS256", "kid": "k1"})

    def fake_find_key(jwks, kid):
        find_count["n"] += 1
        if find_count["n"] < 2:
            return None  # first attempt: key not yet in cache → triggers refresh
        return SimpleNamespace(key=object())

    monkeypatch.setattr(oc, "_find_signing_key", fake_find_key)

    monkeypatch.setattr(oc.jwt, "decode", lambda *a, **kw: expected_claims)

    result = await oc.decode_token("some.token.here")
    assert result == expected_claims
    assert call_count["n"] == 2


@pytest.mark.asyncio
async def test_decode_token_raises_when_key_missing_after_refresh(monkeypatch) -> None:
    async def fake_get_jwks(*, force_refresh: bool = False) -> dict:
        return {"keys": []}

    monkeypatch.setattr(oc, "_get_jwks", fake_get_jwks)
    monkeypatch.setattr(oc.jwt, "get_unverified_header", lambda t: {"alg": "RS256", "kid": "k1"})
    monkeypatch.setattr(oc, "_find_signing_key", lambda jwks, kid: None)

    with pytest.raises(oc.OIDCTokenError, match="Signing key not found in JWKS"):
        await oc.decode_token("some.token.here")
