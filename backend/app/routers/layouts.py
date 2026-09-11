"""Layout snapshot management endpoints (admin only).

Business logic lives in ``app.services.layouts_service`` and is shared with
``app.mcp.admin.layouts`` — this router is a thin adapter that translates
``ServiceError`` into ``HTTPException`` (see #807).
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import (
    LayoutBulkCreate,
    LayoutBulkOut,
    LayoutCopyCreate,
    LayoutCreate,
    LayoutOut,
    LayoutRestorePreview,
    LayoutRestoreRequest,
    LayoutRevisionDiff,
    LayoutRevisionOut,
    LayoutRevisionSaveRequest,
    LayoutWithTablesOut,
)
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


@router.post("/bulk", response_model=LayoutBulkOut, status_code=status.HTTP_201_CREATED)
async def bulk_create_layouts(
    body: LayoutBulkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await layouts_service.bulk_create_layouts(
            db,
            actor=actor,
            items=body.items,
            idempotency_key=body.idempotency_key,
            request_id=getattr(request.state, "request_id", None),
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("", response_model=list[LayoutOut])
async def list_layouts(
    db: AsyncSession = Depends(get_db),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    edition_id: str | None = Query(default=None, description="Filter by edition ID"),
    event_id: str | None = Query(default=None),
    room_id: str | None = Query(default=None, description="Filter by room ID"),
) -> list[dict]:
    return await layouts_service.list_layouts(
        db, limit=limit, offset=offset, edition_id=edition_id, room_id=room_id, event_id=event_id
    )


@router.get("/{layout_id}", response_model=LayoutWithTablesOut)
async def get_layout(
    layout_id: str,
    include_tables: bool = Query(default=False, description="Also return the layout's tables and areas"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        return await layouts_service.get_layout(db, layout_id, include_tables=include_tables)
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


# ---------------------------------------------------------------------------
# Layout revisions (#1021)
# ---------------------------------------------------------------------------


@router.post("/{layout_id}/revisions", response_model=LayoutRevisionOut, status_code=status.HTTP_201_CREATED)
async def save_layout_revision(
    layout_id: str,
    body: LayoutRevisionSaveRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await layouts_service.save_layout_revision(
            db, actor=actor, layout_id=layout_id, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("/{layout_id}/revisions", response_model=list[LayoutRevisionOut])
async def list_layout_revisions(layout_id: str, db: AsyncSession = Depends(get_db)) -> list[dict]:
    try:
        return await layouts_service.list_layout_revisions(db, layout_id)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


# Registered before `/{layout_id}/revisions/{revision_number}` so "compare"
# isn't swallowed as a (non-integer, 422-failing) revision_number path param.
@router.get("/{layout_id}/revisions/compare", response_model=LayoutRevisionDiff)
async def compare_layout_revisions(
    layout_id: str,
    from_ref: str = Query(alias="from", description="A revision number or 'current'."),
    to_ref: str = Query(alias="to", description="A revision number or 'current'."),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        return await layouts_service.compare_layout_revisions(db, layout_id, from_ref, to_ref)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("/{layout_id}/revisions/{revision_number}", response_model=LayoutRevisionOut)
async def get_layout_revision(layout_id: str, revision_number: int, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await layouts_service.get_layout_revision(db, layout_id, revision_number)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/{layout_id}/revisions/{revision_number}/restore/preview", response_model=LayoutRestorePreview)
async def preview_layout_restore(layout_id: str, revision_number: int, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await layouts_service.preview_layout_restore(db, layout_id, revision_number)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/{layout_id}/revisions/{revision_number}/restore", response_model=LayoutWithTablesOut)
async def restore_layout_revision(
    layout_id: str,
    revision_number: int,
    body: LayoutRestoreRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await layouts_service.restore_layout_revision(
            db,
            actor=actor,
            layout_id=layout_id,
            revision_number=revision_number,
            resolve_allocations=body.resolve_allocations,
            request_id=getattr(request.state, "request_id", None),
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
