from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import auth


def _credentials() -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")


class _MockState:
    pass


def _request() -> MagicMock:
    req = MagicMock()
    req.state = _MockState()
    return req


@pytest.mark.asyncio
async def test_require_admin_accepts_admin_role(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": {"roles": ["admin", "user"]}}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    await auth.require_admin(_request(), _credentials())


@pytest.mark.asyncio
async def test_require_admin_rejects_missing_admin_role(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": {"roles": ["user"]}}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_admin(_request(), _credentials())

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_admin_rejects_missing_realm_access(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"preferred_username": "admin"}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_admin(_request(), _credentials())

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_admin_rejects_null_realm_access(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": None}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_admin(_request(), _credentials())

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_admin_rejects_non_dict_realm_access(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": "admin"}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_admin(_request(), _credentials())

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_admin_rejects_string_roles_claim(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": {"roles": "dashboard_admin"}}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_admin(_request(), _credentials())

    assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# require_volunteer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_require_volunteer_accepts_volunteer_role(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": {"roles": ["volunteer"]}}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    await auth.require_volunteer(_request(), _credentials())


@pytest.mark.asyncio
async def test_require_volunteer_accepts_admin_role(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": {"roles": ["admin"]}}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    await auth.require_volunteer(_request(), _credentials())


@pytest.mark.asyncio
async def test_require_volunteer_accepts_both_roles(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": {"roles": ["admin", "volunteer"]}}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    await auth.require_volunteer(_request(), _credentials())


@pytest.mark.asyncio
async def test_require_volunteer_rejects_visitor_role(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": {"roles": ["visitor"]}}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_volunteer(_request(), _credentials())

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_volunteer_rejects_missing_realm_access(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"sub": "some-user"}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_volunteer(_request(), _credentials())

    assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# get_current_claims
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_current_claims_returns_claims(monkeypatch) -> None:
    claims = {"sub": "user-123", "realm_access": {"roles": ["visitor"]}}

    async def fake_decode_token(_token: str) -> dict:
        return claims

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    result = await auth.get_current_claims(_request(), _credentials())
    assert result == claims


@pytest.mark.asyncio
async def test_get_current_claims_raises_401_on_invalid_token(monkeypatch) -> None:
    from app.oidc_config import OIDCTokenError

    async def fake_decode_token(_token: str) -> dict:
        raise OIDCTokenError("invalid")

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.get_current_claims(_request(), _credentials())

    assert exc_info.value.status_code == 401
