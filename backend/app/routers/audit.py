"""Audit log read endpoint (admin only)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.models import AuditEntry
from app.schemas import AuditEntryOut

router = APIRouter(
    prefix="/api/audit",
    tags=["audit"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=list[AuditEntryOut])
async def list_audit_entries(
    db: AsyncSession = Depends(get_db),
    resource_type: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    actor: str | None = Query(default=None),
    action: str | None = Query(default=None),
    since: datetime | None = Query(default=None, description="Only entries at or after this timestamp"),
    until: datetime | None = Query(default=None, description="Only entries at or before this timestamp"),
    pagination: Pagination = Depends(),
) -> list[AuditEntry]:
    stmt = select(AuditEntry)
    if resource_type:
        stmt = stmt.where(AuditEntry.resource_type == resource_type)
    if resource_id:
        stmt = stmt.where(AuditEntry.resource_id == resource_id)
    if actor:
        stmt = stmt.where(AuditEntry.actor == actor)
    if action:
        stmt = stmt.where(AuditEntry.action == action)
    if since:
        stmt = stmt.where(AuditEntry.timestamp >= since)
    if until:
        stmt = stmt.where(AuditEntry.timestamp <= until)
    stmt = stmt.order_by(AuditEntry.timestamp.desc())
    stmt = apply_pagination(stmt, pagination)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/resource-types", response_model=list[str])
async def list_audit_resource_types(db: AsyncSession = Depends(get_db)) -> list[str]:
    """Distinct resource_type values seen so far, for populating a filter dropdown."""
    result = await db.execute(select(AuditEntry.resource_type).distinct().order_by(AuditEntry.resource_type))
    return list(result.scalars().all())
