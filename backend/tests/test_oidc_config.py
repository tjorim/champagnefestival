from __future__ import annotations

from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app import oidc_config as oc
from app.config import settings
from app.main import app


def test_get_jwks_uri_requires_issuer_without_override(monkeypatch) -> None:
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", "")

    with pytest.raises(oc.OIDCTokenError, match="OIDC_ISSUER_URL is not configured"):
        oc._get_jwks_uri()


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_public_provider_urls(monkeypatch) -> None:
    monkeypatch.setattr(settings, "oidc_issuer_url", "https://auth.example.test/realms/champagnefestival/")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 200
    assert response.json() == {
        "issuer": "https://auth.example.test/realms/champagnefestival",
        "authorization_url": "https://auth.example.test/realms/champagnefestival/protocol/openid-connect/auth",
        "token_url": "https://auth.example.test/realms/champagnefestival/protocol/openid-connect/token",
    }


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_503_when_issuer_unset(monkeypatch) -> None:
    monkeypatch.setattr(settings, "oidc_issuer_url", "")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 503


def test_get_jwks_uri_uses_override_without_issuer(monkeypatch) -> None:
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "https://auth.example.test/jwks.json")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", "")

    assert oc._get_jwks_uri() == "https://auth.example.test/jwks.json"


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
