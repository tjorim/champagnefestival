"""Layout snapshot management endpoints (admin only).

Business logic lives in ``app.services.layouts_service`` and is shared with
``app.mcp.admin.layouts`` — this router is a thin adapter that translates
``ServiceError`` into ``HTTPException`` (see #807).
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import LayoutCopyCreate, LayoutCreate, LayoutOut
from app.services import layouts_service
from app.services.errors import ServiceError, to_http_exception

router = APIRouter(
    prefix="/api/layouts",
    tags=["layouts"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=LayoutOut, status_code=status.HTTP_201_CREATED)
async def create_layout(
    body: LayoutCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await layouts_service.create_layout(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/{source_layout_id}/copy", response_model=LayoutOut, status_code=status.HTTP_201_CREATED)
async def copy_layout(
    source_layout_id: str,
    body: LayoutCopyCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await layouts_service.copy_layout(
            db,
            actor=actor,
            source_layout_id=source_layout_id,
            body=body,
            request_id=getattr(request.state, "request_id", None),
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("", response_model=list[LayoutOut])
async def list_layouts(
    db: AsyncSession = Depends(get_db),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    return await layouts_service.list_layouts(db, limit=limit, offset=offset)


@router.get("/{layout_id}", response_model=LayoutOut)
async def get_layout(layout_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await layouts_service.get_layout(db, layout_id)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{layout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_layout(
    layout_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await layouts_service.delete_layout(
            db, actor=actor, layout_id=layout_id, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
