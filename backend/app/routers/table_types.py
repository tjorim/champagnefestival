"""Table type management endpoints (admin only).

Business logic lives in ``app.services.table_types_service`` and is shared
with ``app.mcp.admin.table_types`` — this router is a thin adapter that
translates ``ServiceError`` into ``HTTPException`` (see #807).
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import TableTypeCreate, TableTypeOut, TableTypeUpdate
from app.services import table_types_service
from app.services.errors import ServiceError, to_http_exception

router = APIRouter(
    prefix="/api/table-types",
    tags=["table-types"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=TableTypeOut, status_code=status.HTTP_201_CREATED)
async def create_table_type(
    body: TableTypeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await table_types_service.create_table_type(
        db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
    )


@router.get("", response_model=list[TableTypeOut])
async def list_table_types(
    db: AsyncSession = Depends(get_db),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    return await table_types_service.list_table_types(db, limit=limit, offset=offset)


@router.get("/{type_id}", response_model=TableTypeOut)
async def get_table_type(type_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await table_types_service.get_table_type(db, type_id)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{type_id}", response_model=TableTypeOut)
async def update_table_type(
    type_id: str,
    body: TableTypeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await table_types_service.update_table_type(
            db, actor=actor, type_id=type_id, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_table_type(
    type_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await table_types_service.delete_table_type(
            db, actor=actor, type_id=type_id, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
