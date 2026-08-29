"""Admin-only operational visibility for durable delivery jobs."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import OutboxJob

router = APIRouter(prefix="/api/outbox", tags=["outbox"], dependencies=[Depends(require_admin)])


class OutboxJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    job_type: str
    resource_type: str
    resource_id: str
    state: str
    attempt_count: int
    max_attempts: int
    scheduled_at: datetime
    locked_until: datetime | None
    last_error_code: str | None
    created_at: datetime
    completed_at: datetime | None


@router.get("", response_model=list[OutboxJobOut])
async def list_outbox_jobs(
    state: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[OutboxJob]:
    stmt = select(OutboxJob).order_by(OutboxJob.created_at.desc(), OutboxJob.id.desc()).limit(200)
    if state:
        stmt = stmt.where(OutboxJob.state == state)
    return list((await db.scalars(stmt)).all())
