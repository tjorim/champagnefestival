"""Admin stamp card operations; check-ins use the shared service."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import StampCardOut, StampCardTypeOut, StampCardTypeWrite, StampRewardOut, StampRewardUpdate
from app.services import stamp_cards_service as service

router = APIRouter(prefix="/api/stamp-cards", tags=["stamp-cards"], dependencies=[Depends(require_admin)])


@router.get("/types", response_model=list[StampCardTypeOut])
async def list_types(db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await service.list_types(db)


@router.post("/types", status_code=201, response_model=StampCardTypeOut)
async def create_type(
    body: StampCardTypeWrite, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
) -> dict:
    return await service.save_type(db, body=body, actor=actor)


@router.put("/types/{type_id}", response_model=StampCardTypeOut)
async def update_type(
    type_id: str, body: StampCardTypeWrite, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
) -> dict:
    return await service.save_type(db, type_id=type_id, body=body, actor=actor)


@router.get("/people/{person_id}", response_model=list[StampCardOut])
async def list_cards(person_id: str, db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await service.list_cards(db, person_id)


@router.put("/rewards/{reward_id}", response_model=StampRewardOut)
async def set_reward(
    reward_id: str, body: StampRewardUpdate, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
) -> dict:
    return await service.set_reward(db, reward_id=reward_id, handed_out=body.handed_out, actor=actor)
