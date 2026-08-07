"""Area management endpoints (admin only).

Business logic lives in ``app.services.areas_service`` and is shared with
``app.mcp.admin.areas`` — this router is a thin adapter that translates
``ServiceError`` into ``HTTPException`` (see #807).
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import AreaCreate, AreaOut, AreaUpdate
from app.services import areas_service
from app.services.errors import ServiceError, to_http_exception

router = APIRouter(
    prefix="/api/areas",
    tags=["areas"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=AreaOut, status_code=status.HTTP_201_CREATED)
async def create_area(
    body: AreaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await areas_service.create_area(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("", response_model=list[AreaOut])
async def list_areas(
    layout_id: str | None = Query(default=None, description="Filter by layout ID"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await areas_service.list_areas(db, layout_id)


@router.get("/{area_id}", response_model=AreaOut)
async def get_area(area_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await areas_service.get_area(db, area_id)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{area_id}", response_model=AreaOut)
async def update_area(
    area_id: str,
    body: AreaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await areas_service.update_area(
            db, actor=actor, area_id=area_id, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_area(
    area_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await areas_service.delete_area(
            db, actor=actor, area_id=area_id, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
