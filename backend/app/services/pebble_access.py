"""Issue and validate credentials scoped to the Pebble registration glance."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PebbleAccessToken
from app.utils import make_id

TOKEN_PREFIX = "cfpat_"
_LAST_USED_UPDATE_INTERVAL = timedelta(minutes=15)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def rotate_pebble_token(db: AsyncSession, user_id: str) -> str:
    """Replace the user's previous Pebble token and return the new raw value once."""
    raw_token = f"{TOKEN_PREFIX}{secrets.token_urlsafe(32)}"
    token_hash = _token_hash(raw_token)
    await db.execute(delete(PebbleAccessToken).where(PebbleAccessToken.user_id == user_id))
    db.add(
        PebbleAccessToken(
            id=make_id("pbt"),
            user_id=user_id,
            token_hash=token_hash,
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        result = await db.execute(select(PebbleAccessToken).where(PebbleAccessToken.user_id == user_id))
        existing = result.scalar_one_or_none()
        if existing is None:
            raise
        existing.token_hash = token_hash
        existing.created_at = datetime.now(UTC)
        existing.last_used_at = None
        await db.commit()
    return raw_token


async def revoke_pebble_token(db: AsyncSession, user_id: str) -> None:
    await db.execute(delete(PebbleAccessToken).where(PebbleAccessToken.user_id == user_id))
    await db.commit()


async def authenticate_pebble_token(db: AsyncSession, raw_token: str) -> str | None:
    """Return the owning user ID for a valid scoped token."""
    if not raw_token.startswith(TOKEN_PREFIX):
        return None
    result = await db.execute(select(PebbleAccessToken).where(PebbleAccessToken.token_hash == _token_hash(raw_token)))
    token = result.scalar_one_or_none()
    if token is None:
        return None
    now = datetime.now(UTC)
    last_used_at = token.last_used_at
    if last_used_at is not None:
        if last_used_at.tzinfo is None:
            last_used_at = last_used_at.replace(tzinfo=UTC)
        if now - last_used_at < _LAST_USED_UPDATE_INTERVAL:
            return token.user_id
    token.last_used_at = now
    await db.commit()
    return token.user_id
