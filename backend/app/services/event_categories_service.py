"""Application-service operations for event categories (#1222).

Used by both ``app.routers.event_categories`` (REST) and
``app.mcp.admin.event_categories`` (MCP); the logic is shared with product
categories in ``app.services.categories``.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, EventCategory
from app.schemas import CategoryCreate, CategoryUpdate
from app.services import categories

KIND = categories.CategoryKind(noun="event", model=EventCategory, used_by=Event.category)


async def list_categories(db: AsyncSession, *, locale: str | None = None) -> list[dict]:
    return await categories.list_categories(db, KIND, locale=locale)


async def ensure_category_exists(db: AsyncSession, key: str) -> None:
    await categories.ensure_category_exists(db, KIND, key)


async def create_category(db: AsyncSession, *, actor: str, body: CategoryCreate, request_id: str | None = None) -> dict:
    return await categories.create_category(db, KIND, actor=actor, body=body, request_id=request_id)


async def update_category(
    db: AsyncSession, *, actor: str, key: str, body: CategoryUpdate, request_id: str | None = None
) -> dict:
    return await categories.update_category(db, KIND, actor=actor, key=key, body=body, request_id=request_id)


async def delete_category(db: AsyncSession, *, actor: str, key: str, request_id: str | None = None) -> dict:
    return await categories.delete_category(db, KIND, actor=actor, key=key, request_id=request_id)
