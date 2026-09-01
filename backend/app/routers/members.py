"""Member CRUD endpoints (admin-only).

Members are stored in the people table as a subset with role='member'.
Business logic lives in ``app.services.members_service`` and is shared with
``app.mcp.admin.members``.
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import Pagination, get_request_id
from app.schemas import PersonCreate, PersonListEnvelope, PersonOut, PersonUpdate
from app.services import members_service
from app.utils import person_to_dict

router = APIRouter(
    prefix="/api/members",
    tags=["members"],
    dependencies=[Depends(require_admin)],
)

# See app/routers/people.py's ADMIN_LIST_DEFAULT_LIMIT for why this is its own
# constant rather than app.services.operational_search's door-lookup-sized one.
ADMIN_LIST_DEFAULT_LIMIT = 200


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_member(
    body: PersonCreate,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    return await members_service.create_member(db, body=body, actor=actor, request_id=request_id)


@router.get("", response_model=PersonListEnvelope)
async def list_members(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    pagination: Pagination = Depends(),
) -> dict:
    filtered_stmt = members_service.search_members_stmt(q=q, active=active)
    total = (await db.execute(select(func.count()).select_from(filtered_stmt.order_by(None).subquery()))).scalar_one()

    limit = pagination.limit or ADMIN_LIST_DEFAULT_LIMIT
    page = pagination.page
    stmt = filtered_stmt.offset((page - 1) * limit).limit(limit)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    items = [person_to_dict(p) for p in rows]
    return {"items": items, "total": total, "limit": limit, "page": page}


@router.get("/{person_id}", response_model=PersonOut)
async def get_member(person_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    person = await members_service.get_member_or_404(db, person_id)
    return person_to_dict(person)


@router.put("/{person_id}", response_model=PersonOut)
async def update_member(
    person_id: str,
    body: PersonUpdate,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    person = await members_service.get_member_or_404(db, person_id)
    return await members_service.apply_member_update(db, person, body, actor=actor, request_id=request_id)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(
    person_id: str,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> None:
    person = await members_service.get_member_or_404(db, person_id)
    await members_service.delete_member(db, person, actor=actor, request_id=request_id)
