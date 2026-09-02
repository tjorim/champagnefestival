"""Public and administrative announcement endpoints."""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import Announcement
from app.schemas import (
    AnnouncementCreate,
    AnnouncementOut,
    AnnouncementPublicOut,
    AnnouncementReorder,
    AnnouncementUpdate,
    FaqLocale,
)
from app.services import announcements_service as service
from app.services.errors import ServiceError, to_http_exception

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


@router.get("/active", response_model=list[AnnouncementPublicOut])
async def active(locale: FaqLocale = Query(default="nl"), db: AsyncSession = Depends(get_db)) -> list[dict]:
    now = datetime.now(UTC)
    text_column = getattr(Announcement, f"text_{locale}")
    result = await db.execute(select(Announcement).where(
        Announcement.active.is_(True), text_column.isnot(None),
        or_(Announcement.starts_at.is_(None), Announcement.starts_at <= now),
        or_(Announcement.ends_at.is_(None), Announcement.ends_at > now),
    ).order_by(Announcement.sort_order))
    output = []
    for item in result.scalars():
        text = getattr(item, f"text_{locale}")
        if not text:
            continue
        output.append({"id": item.id, "text": text, "level": item.level, "link_url": item.link_url, "link_label": getattr(item, f"link_label_{locale}") if item.link_url else None})
    return output


@router.get("", response_model=list[AnnouncementOut], dependencies=[Depends(require_admin)])
async def list_all(db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await service.list_all(db)


async def _call(operation):
    try:
        return await operation
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create(body: AnnouncementCreate, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)) -> dict:
    return await _call(service.create(db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)))


@router.put("/{item_id}", response_model=AnnouncementOut, dependencies=[Depends(require_admin)])
async def update(item_id: str, body: AnnouncementUpdate, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)) -> dict:
    return await _call(service.update(db, actor=actor, item_id=item_id, body=body, request_id=getattr(request.state, "request_id", None)))


@router.post("/reorder", response_model=list[AnnouncementOut], dependencies=[Depends(require_admin)])
async def reorder(body: AnnouncementReorder, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)) -> list[dict]:
    return await _call(service.reorder(db, actor=actor, ordered_ids=body.ordered_ids, request_id=getattr(request.state, "request_id", None)))


@router.delete("/{item_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete(item_id: str, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)) -> None:
    await _call(service.delete(db, actor=actor, item_id=item_id, request_id=getattr(request.state, "request_id", None)))
