"""Member CRUD endpoints (admin-only).

Members are stored in the people table as a subset with role='member'.
Business logic lives in ``app.services.members_service`` and is shared with
``app.mcp.admin.members``.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import get_request_id
from app.schemas import PersonCreate, PersonOut, PersonUpdate
from app.services import members_service
from app.utils import person_to_dict

router = APIRouter(
    prefix="/api/members",
    tags=["members"],
    dependencies=[Depends(require_admin)],
)

# GET "" was retired — the frontend now reads the member list from
# GET /api/people?role=member (see PeopleManagement/MembersManagement and
# app/routers/people.py), since it was functionally identical to that filter
# and its own hand-rolled search predicate had already drifted from people.py's.
# The CRUD endpoints below stay: "delete a member" is a role removal (soft
# archive), not a generic person delete, so it keeps its own named operation.


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_member(
    body: PersonCreate,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    return await members_service.create_member(db, body=body, actor=actor, request_id=request_id)


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
