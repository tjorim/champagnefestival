"""Room management endpoints (admin only).

Business logic lives in ``app.services.rooms_service`` and is shared with
``app.mcp.admin.rooms`` — this router is a thin adapter that translates
``ServiceError`` into ``HTTPException`` (see #807).
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import RoomBulkCreate, RoomBulkOut, RoomCreate, RoomOut, RoomUpdate
from app.services import rooms_service
from app.services.errors import ServiceError, to_http_exception

router = APIRouter(
    prefix="/api/rooms",
    tags=["rooms"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await rooms_service.create_room(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/bulk", response_model=RoomBulkOut, status_code=status.HTTP_201_CREATED)
async def bulk_create_rooms(
    body: RoomBulkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await rooms_service.bulk_create_rooms(
            db,
            actor=actor,
            items=body.items,
            idempotency_key=body.idempotency_key,
            request_id=getattr(request.state, "request_id", None),
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("", response_model=list[RoomOut])
async def list_rooms(
    venue_id: str | None = Query(default=None, description="Filter by venue ID"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await rooms_service.list_rooms(db, venue_id)


@router.get("/{room_id}", response_model=RoomOut)
async def get_room(room_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await rooms_service.get_room(db, room_id)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{room_id}", response_model=RoomOut)
async def update_room(
    room_id: str,
    body: RoomUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await rooms_service.update_room(
            db, actor=actor, room_id=room_id, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await rooms_service.delete_room(
            db, actor=actor, room_id=room_id, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
