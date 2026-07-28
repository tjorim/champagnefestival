"""Unit tests for scoped Pebble token lifecycle behavior."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.services.pebble_access import (
    TOKEN_PREFIX,
    _token_hash,
    authenticate_pebble_token,
    rotate_pebble_token,
)


@pytest.mark.anyio
async def test_rotate_recovers_from_unique_constraint_race() -> None:
    existing = SimpleNamespace(token_hash="old", created_at=None, last_used_at=datetime.now(UTC))
    lookup = MagicMock()
    lookup.scalar_one_or_none.return_value = existing
    db = MagicMock()
    db.execute = AsyncMock(side_effect=[MagicMock(), lookup])
    db.commit = AsyncMock(side_effect=[IntegrityError("insert", {}, Exception("unique")), None])
    db.rollback = AsyncMock()

    raw_token = await rotate_pebble_token(db, "usr-1")

    assert raw_token.startswith(TOKEN_PREFIX)
    assert existing.token_hash == _token_hash(raw_token)
    assert existing.last_used_at is None
    db.rollback.assert_awaited_once()
    assert db.commit.await_count == 2


@pytest.mark.anyio
async def test_authentication_throttles_recent_activity_write() -> None:
    token = SimpleNamespace(user_id="usr-1", last_used_at=datetime.now(UTC) - timedelta(minutes=1))
    result = MagicMock()
    result.scalar_one_or_none.return_value = token
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()

    user_id = await authenticate_pebble_token(db, f"{TOKEN_PREFIX}token")

    assert user_id == "usr-1"
    db.commit.assert_not_awaited()
