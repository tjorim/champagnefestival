"""Admin (read) MCP tool implementations for the audit trail.

Mirrors ``app.routers.audit``. Read-only, but admin-gated like every other
module in this package — the audit log itself is sensitive operational data.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.models import AuditEntry


def _entry_to_dict(entry: AuditEntry) -> dict:
    return {
        "id": entry.id,
        "timestamp": entry.timestamp.isoformat(),
        "actor": entry.actor,
        "action": entry.action,
        "resource_type": entry.resource_type,
        "resource_id": entry.resource_id,
        "request_id": entry.request_id,
        "details": entry.details,
    }


async def list_audit_entries(
    session_factory: Any,
    *,
    resource_type: str | None = None,
    resource_id: str | None = None,
    actor: str | None = None,
    action: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> dict:
    """List audit entries, newest first, with optional filters.

    ``since``/``until`` are ISO-8601 timestamps (a bare date such as
    ``"2026-03-20"`` also parses); naive timestamps are treated as UTC.
    ``limit`` caps the page size (unlimited when omitted); ``offset`` skips
    that many matching rows.
    """
    async with session_factory() as db:
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
            since_dt = datetime.fromisoformat(since)
            if since_dt.tzinfo is None:
                since_dt = since_dt.replace(tzinfo=UTC)
            stmt = stmt.where(AuditEntry.timestamp >= since_dt)
        if until:
            until_dt = datetime.fromisoformat(until)
            if until_dt.tzinfo is None:
                until_dt = until_dt.replace(tzinfo=UTC)
            stmt = stmt.where(AuditEntry.timestamp <= until_dt)
        stmt = stmt.order_by(AuditEntry.timestamp.desc()).offset(offset)
        if limit is not None:
            stmt = stmt.limit(limit)
        result = await db.execute(stmt)
        return {"entries": [_entry_to_dict(e) for e in result.scalars().all()]}


async def list_audit_resource_types(session_factory: Any) -> dict:
    """Distinct ``resource_type`` values seen so far."""
    async with session_factory() as db:
        result = await db.execute(select(AuditEntry.resource_type).distinct().order_by(AuditEntry.resource_type))
        return {"resource_types": list(result.scalars().all())}
