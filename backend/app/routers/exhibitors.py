"""Exhibitor management endpoints.

Business logic lives in ``app.services.exhibitors_service`` and is shared
with ``app.mcp.admin.exhibitors`` — this router is a thin adapter that
translates ``ServiceError`` into ``HTTPException`` (see #807, #860).
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.models import Exhibitor
from app.schemas import ExhibitorCreate, ExhibitorOut, ExhibitorUpdate
from app.services import exhibitors_service
from app.services.errors import ServiceError, to_http_exception
from app.utils import exhibitor_to_dict, get_or_404

router = APIRouter(prefix="/api/exhibitors", tags=["exhibitors"])


@router.get("", response_model=list[ExhibitorOut], dependencies=[Depends(require_admin)])
async def list_exhibitors(
    exhibitor_type: str | None = Query(default=None, alias="type"),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(),
) -> list[dict]:
    stmt = select(Exhibitor).order_by(Exhibitor.id)
    if exhibitor_type is not None:
        stmt = stmt.where(Exhibitor.type == exhibitor_type)
    stmt = apply_pagination(stmt, pagination)
    result = await db.execute(stmt)
    exhibitors = result.scalars().all()
    person_ids = [e.contact_person_id for e in exhibitors if e.contact_person_id]
    contacts = await exhibitors_service.load_contacts_by_ids(db, person_ids)
    return [
        exhibitor_to_dict(e, contacts.get(e.contact_person_id) if e.contact_person_id else None) for e in exhibitors
    ]


@router.post(
    "",
    response_model=ExhibitorOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_exhibitor(
    body: ExhibitorCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await exhibitors_service.create_exhibitor(
            db, body=body, actor=actor, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{exhibitor_id}", response_model=ExhibitorOut, dependencies=[Depends(require_admin)])
async def update_exhibitor(
    exhibitor_id: int,
    body: ExhibitorUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    e = await get_or_404(db, Exhibitor, exhibitor_id, "Exhibitor not found.")
    try:
        return await exhibitors_service.apply_exhibitor_update(
            db, e, body, actor=actor, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete(
    "/{exhibitor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_exhibitor(
    exhibitor_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    e = await get_or_404(db, Exhibitor, exhibitor_id, "Exhibitor not found.")
    try:
        await exhibitors_service.delete_exhibitor(
            db, e, actor=actor, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
