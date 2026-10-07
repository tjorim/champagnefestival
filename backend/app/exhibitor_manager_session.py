"""Independent email-verified exhibitor manager sessions (#1192)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import ExhibitorManagerMagicLink, ExhibitorManagerSession
from app.utils import make_id

# Same lifetime as visitor sessions; credentials and identity remain separate.
SESSION_IDLE_TIMEOUT = timedelta(days=7)
SESSION_HARD_CAP = timedelta(days=30)

COOKIE_NAME = "exhibitor_manager_session"


def _hash_session_id(session_id: str) -> str:
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def set_session_cookie(response: Response, session_id: str) -> None:
    """Set the opaque session cookie with the fixed hard-cap lifetime."""
    response.set_cookie(
        COOKIE_NAME,
        session_id,
        max_age=int(SESSION_HARD_CAP.total_seconds()),
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax")


async def create_session(db: AsyncSession, response: Response, email: str) -> None:
    """Stage a hashed session and cookie; caller commits with link redemption."""
    session_id = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    db.add(
        ExhibitorManagerSession(
            id=make_id("ems"),
            session_hash=_hash_session_id(session_id),
            email=email,
            created_at=now,
            last_seen_at=now,
            expires_at=now + SESSION_IDLE_TIMEOUT,
            hard_expires_at=now + SESSION_HARD_CAP,
        )
    )
    set_session_cookie(response, session_id)


async def resolve_session(db: AsyncSession, session_id: str) -> ExhibitorManagerSession | None:
    """Validate deadlines and durably slide the idle window within the hard cap."""
    row = (
        await db.execute(
            select(ExhibitorManagerSession)
            .where(ExhibitorManagerSession.session_hash == _hash_session_id(session_id))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    now = datetime.now(UTC)
    expires_at = _aware(row.expires_at)
    hard_expires_at = _aware(row.hard_expires_at)
    if now >= expires_at or now >= hard_expires_at:
        return None
    row.last_seen_at = now
    row.expires_at = min(now + SESSION_IDLE_TIMEOUT, hard_expires_at)
    await db.commit()
    await db.refresh(row)
    return row


async def revoke_session(db: AsyncSession, session_id: str) -> None:
    """Delete the hashed session, including when it is already absent."""
    await db.execute(
        delete(ExhibitorManagerSession).where(ExhibitorManagerSession.session_hash == _hash_session_id(session_id))
    )
    await db.commit()


async def cleanup_expired_sessions(db: AsyncSession) -> int:
    """Remove sessions past their idle deadline or hard cap."""
    now = datetime.now(UTC)
    deleted_ids = (
        await db.scalars(
            delete(ExhibitorManagerSession)
            .where((ExhibitorManagerSession.expires_at < now) | (ExhibitorManagerSession.hard_expires_at < now))
            .returning(ExhibitorManagerSession.id)
        )
    ).all()
    await db.commit()
    return len(deleted_ids)


async def cleanup_expired_magic_links(db: AsyncSession) -> int:
    """Remove expired and redeemed links during daily housekeeping."""
    deleted_ids = (
        await db.scalars(
            delete(ExhibitorManagerMagicLink)
            .where(ExhibitorManagerMagicLink.expires_at < datetime.now(UTC))
            .returning(ExhibitorManagerMagicLink.id)
        )
    ).all()
    await db.commit()
    return len(deleted_ids)


async def get_current_exhibitor_manager(request: Request, db: AsyncSession = Depends(get_db)) -> str:
    session_id = request.cookies.get(COOKIE_NAME)
    row = await resolve_session(db, session_id) if session_id else None
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return row.email
