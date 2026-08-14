"""Member CRUD endpoints (admin-only).

Members are stored in the people table as a subset with role='member'.
Business logic lives in ``app.services.members_service`` and is shared with
``app.mcp.admin.members``.
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.schemas import PersonCreate, PersonOut, PersonUpdate
from app.services import members_service
from app.utils import person_to_dict

router = APIRouter(
    prefix="/api/members",
    tags=["members"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_member(
    body: PersonCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await members_service.create_member(
        db, body=body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.get("", response_model=list[PersonOut])
async def list_members(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    pagination: Pagination = Depends(),
) -> list[dict]:
    stmt = members_service.search_members_stmt(q=q, active=active)
    stmt = apply_pagination(stmt, pagination)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [person_to_dict(p) for p in rows]


@router.get("/{person_id}", response_model=PersonOut)
async def get_member(person_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    person = await members_service.get_member_or_404(db, person_id)
    return person_to_dict(person)


@router.put("/{person_id}", response_model=PersonOut)
async def update_member(
    person_id: str,
    body: PersonUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    person = await members_service.get_member_or_404(db, person_id)
    return await members_service.apply_member_update(
        db, person, body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(
    person_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    person = await members_service.get_member_or_404(db, person_id)
    await members_service.delete_member(
        db, person, actor=actor, request_id=getattr(request.state, "request_id", None)
    )
