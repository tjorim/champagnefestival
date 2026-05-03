from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import auth


def _credentials() -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")


@pytest.mark.asyncio
async def test_require_admin_accepts_preferred_username_case_insensitive(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict[str, str]:
        return {"preferred_username": "Admin"}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)
    monkeypatch.setattr(auth, "_ADMIN_USERNAMES", frozenset({"admin"}))

    await auth.require_admin(_credentials())


@pytest.mark.asyncio
async def test_require_admin_rejects_email_local_part_fallback(monkeypatch) -> None:
    async def fake_decode_token(_token: str) -> dict[str, str]:
        return {"email": "admin@example.com"}

    monkeypatch.setattr(auth, "decode_token", fake_decode_token)
    monkeypatch.setattr(auth, "_ADMIN_USERNAMES", frozenset({"admin"}))

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_admin(_credentials())

    assert exc_info.value.status_code == 403
