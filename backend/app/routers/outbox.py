"""Admin-only operational visibility for durable delivery jobs."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.dependencies import Pagination
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


class OutboxJobListEnvelope(BaseModel):
    """Paginated response for the outbox diagnostics list.

    ``total`` counts every job matching the current filter, not just this page,
    so a client can tell ``items`` was truncated instead of reading a partial
    list as if it were complete. Mirrors ``RegistrationListEnvelope``.
    """

    items: list[OutboxJobOut]
    total: int
    limit: int
    page: int


# One predictable page size when the caller sends no ``limit`` (the ceiling is
# ``Pagination``'s own ``limit`` validation); ``total`` and ``page`` let a caller
# read every job, newest first.
OUTBOX_DEFAULT_LIMIT = 200


@router.get("", response_model=OutboxJobListEnvelope)
async def list_outbox_jobs(
    state: str | None = Query(default=None),
    pagination: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
) -> dict:
    filtered = select(OutboxJob)
    if state:
        filtered = filtered.where(OutboxJob.state == state)
    total = (await db.execute(select(func.count()).select_from(filtered.subquery()))).scalar_one()

    limit = pagination.limit or OUTBOX_DEFAULT_LIMIT
    page = pagination.page
    stmt = filtered.order_by(OutboxJob.created_at.desc(), OutboxJob.id.desc()).offset((page - 1) * limit).limit(limit)
    items = list((await db.scalars(stmt)).all())
    return {"items": items, "total": total, "limit": limit, "page": page}
