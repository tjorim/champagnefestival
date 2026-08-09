"""Venue management endpoints.

Business logic lives in ``app.services.venues_service`` and is shared with
``app.mcp.admin.venues`` — this router is a thin adapter that translates
``ServiceError`` into ``HTTPException`` (see #807).
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import VenueCreate, VenueOut, VenueUpdate
from app.services import venues_service
from app.services.errors import ServiceError, to_http_exception

router = APIRouter(
    prefix="/api/venues",
    tags=["venues"],
)


@router.post("", response_model=VenueOut, status_code=status.HTTP_201_CREATED)
async def create_venue(
    body: VenueCreate,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await venues_service.create_venue(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("", response_model=list[VenueOut])
async def list_venues(
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    return await venues_service.list_venues(db, limit=limit, offset=offset)


@router.get("/{venue_id}", response_model=VenueOut, dependencies=[Depends(require_admin)])
async def get_venue(venue_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await venues_service.get_venue(db, venue_id)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{venue_id}", response_model=VenueOut)
async def update_venue(
    venue_id: str,
    body: VenueUpdate,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await venues_service.update_venue(
            db, actor=actor, venue_id=venue_id, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_venue(
    venue_id: str,
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await venues_service.delete_venue(
            db, actor=actor, venue_id=venue_id, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
