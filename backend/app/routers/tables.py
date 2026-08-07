"""Table management endpoints (admin only).

Business logic lives in ``app.services.tables_service`` and is shared with
``app.mcp.admin.tables`` — this router is a thin adapter that translates
``ServiceError`` into ``HTTPException`` (see #807).
"""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import TableCreate, TableOut, TableUpdate
from app.services import tables_service
from app.services.errors import ServiceError, to_http_exception

router = APIRouter(
    prefix="/api/tables",
    tags=["tables"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=TableOut, status_code=status.HTTP_201_CREATED)
async def create_table(
    body: TableCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await tables_service.create_table(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("", response_model=list[TableOut])
async def list_tables(db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await tables_service.list_tables(db)


@router.get("/{table_id}", response_model=TableOut)
async def get_table(table_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await tables_service.get_table(db, table_id)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{table_id}", response_model=TableOut)
async def update_table(
    table_id: str,
    body: TableUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await tables_service.update_table(
            db, actor=actor, table_id=table_id, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_table(
    table_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await tables_service.delete_table(
            db, actor=actor, table_id=table_id, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
