from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import auth


def _credentials() -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")


@pytest.mark.asyncio
async def test_require_admin_accepts_admin_role(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": {"roles": ["admin", "user"]}}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    await auth.require_admin(_credentials())


@pytest.mark.asyncio
async def test_require_admin_rejects_missing_admin_role(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"realm_access": {"roles": ["user"]}}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_admin(_credentials())

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_admin_rejects_missing_realm_access(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict:
        return {"preferred_username": "admin"}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_admin(_credentials())

    assert exc_info.value.status_code == 403
