"""Content management endpoints (producers, sponsors)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import ContentItem
from app.schemas import ALLOWED_CONTENT_KEYS, ContentItemOut, ContentItemUpdate

router = APIRouter(prefix="/api/content", tags=["content"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Public: read content
# ---------------------------------------------------------------------------


@router.get("/{key}", response_model=ContentItemOut)
async def get_content(key: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Return the stored content for a given key (e.g. 'producers', 'sponsors').

    This endpoint is publicly accessible so the frontend can fetch the latest
    content without authentication.  Returns 404 when no admin has saved data
    for the key yet — the frontend falls back to hardcoded placeholder data.
    """
    _validate_key(key)
    result = await db.execute(select(ContentItem).where(ContentItem.key == key))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="No content saved yet. The frontend will use its built-in placeholder data.")
    return {"key": item.key, "value": item.get_items(), "updated_at": item.updated_at}


# ---------------------------------------------------------------------------
# Admin: upsert content
# ---------------------------------------------------------------------------


@router.put(
    "/{key}",
    response_model=ContentItemOut,
    dependencies=[Depends(require_admin)],
)
async def upsert_content(
    key: str,
    body: ContentItemUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or replace the content list for a given key.

    Allowed keys: ``producers``, ``sponsors``.
    """
    _validate_key(key)
    result = await db.execute(select(ContentItem).where(ContentItem.key == key))
    item = result.scalar_one_or_none()

    if item is None:
        item = ContentItem(key=key)
        db.add(item)

    item.set_items([i.model_dump() for i in body.value])
    item.updated_at = _utcnow()

    await db.commit()
    await db.refresh(item)
    return {"key": item.key, "value": item.get_items(), "updated_at": item.updated_at}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _validate_key(key: str) -> None:
    if key not in ALLOWED_CONTENT_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content key '{key}'. Allowed: {sorted(ALLOWED_CONTENT_KEYS)}.",
        )
