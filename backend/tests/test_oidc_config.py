from __future__ import annotations

import pytest

from app import oidc_config as oc


def test_get_jwks_uri_requires_issuer_without_override(monkeypatch) -> None:
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", "")

    with pytest.raises(oc.OIDCTokenError, match="OIDC_ISSUER_URL is not configured"):
        oc._get_jwks_uri()


def test_get_jwks_uri_uses_override_without_issuer(monkeypatch) -> None:
    monkeypatch.setattr(oc.settings, "oidc_jwks_uri", "https://auth.example.test/jwks.json")
    monkeypatch.setattr(oc.settings, "oidc_issuer_url", "")

    assert oc._get_jwks_uri() == "https://auth.example.test/jwks.json"


@pytest.mark.asyncio
async def test_decode_token_expired(monkeypatch) -> None:
    from jose.exceptions import ExpiredSignatureError

    async def fake_get_jwks(**_):
        return {"keys": []}

    monkeypatch.setattr(oc, "_get_jwks", fake_get_jwks)

    def fake_decode(*args, **kwargs):
        raise ExpiredSignatureError("Signature has expired")

    monkeypatch.setattr(oc.jwt, "decode", fake_decode)

    with pytest.raises(oc.OIDCTokenError, match="expired"):
        await oc.decode_token("some.token.here")


@pytest.mark.asyncio
async def test_decode_token_invalid(monkeypatch) -> None:
    from jose import JWTError

    async def fake_get_jwks(**_):
        return {"keys": []}

    monkeypatch.setattr(oc, "_get_jwks", fake_get_jwks)

    def fake_decode(*args, **kwargs):
        raise JWTError("bad token")

    monkeypatch.setattr(oc.jwt, "decode", fake_decode)

    with pytest.raises(oc.OIDCTokenError, match="Token validation failed"):
        await oc.decode_token("some.token.here")


@pytest.mark.asyncio
async def test_decode_token_refreshes_jwks_on_missing_key(monkeypatch) -> None:
    from jose import JWTError

    call_count = {"n": 0}
    expected_claims = {"sub": "user123", "preferred_username": "alice"}

    async def fake_get_jwks(*, force_refresh: bool = False) -> dict:
        call_count["n"] += 1
        return {"keys": []}

    monkeypatch.setattr(oc, "_get_jwks", fake_get_jwks)

    def fake_decode(*args, **kwargs):
        if call_count["n"] < 2:
            raise JWTError("Unable to find a signing key")
        return expected_claims

    monkeypatch.setattr(oc.jwt, "decode", fake_decode)

    result = await oc.decode_token("some.token.here")
    assert result == expected_claims
    assert call_count["n"] == 2
