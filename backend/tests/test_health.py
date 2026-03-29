"""Tests for the health check endpoint and application settings validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES, Settings


@pytest.mark.anyio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_settings_reject_nonpositive_guest_access_token_ttl():
    with pytest.raises(ValidationError, match=r"GUEST_ACCESS_TOKEN_TTL_MINUTES must be greater than 0\."):
        Settings(guest_access_token_ttl_minutes=0)


def test_settings_reject_excessive_guest_access_token_ttl():
    with pytest.raises(
        ValidationError,
        match=(f"GUEST_ACCESS_TOKEN_TTL_MINUTES must be less than or equal to {GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES}\\."),
    ):
        Settings(guest_access_token_ttl_minutes=GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES + 1)

