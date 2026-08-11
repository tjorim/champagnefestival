"""Admin (read) MCP tool implementations for the audit trail.

Mirrors ``app.routers.audit``. Read-only, but admin-gated like every other
module in this package — the audit log itself is sensitive operational data.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.mcp.utils import MCPToolError
from app.models import AuditEntry

DEFAULT_AUDIT_LIMIT = 100
MAX_AUDIT_LIMIT = 1000


def _entry_to_dict(entry: AuditEntry) -> dict:
    return {
        "id": entry.id,
        "timestamp": entry.timestamp.isoformat(),
        "actor": entry.actor,
        "auth_source": entry.auth_source,
        "subject": entry.subject,
        "integration_client_id": entry.integration_client_id,
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
    before_id: str | None = None,
) -> dict:
    """List audit entries, newest first, with optional filters.

    ``since``/``until`` are ISO-8601 timestamps (a bare date such as
    ``"2026-03-20"`` also parses); naive timestamps are treated as UTC.
    ``limit`` caps the page size — defaults to ``DEFAULT_AUDIT_LIMIT`` (100),
    capped at ``MAX_AUDIT_LIMIT`` (1000); the audit table only grows, so an
    unbounded read would eventually exhaust memory. ``offset`` skips that
    many matching rows.
    """
    if offset < 0:
        raise MCPToolError("offset must not be negative.")
    effective_limit = DEFAULT_AUDIT_LIMIT if limit is None else max(1, min(limit, MAX_AUDIT_LIMIT))
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
        if before_id is not None:
            cursor = await db.get(AuditEntry, before_id)
            if cursor is None:
                raise MCPToolError("audit cursor does not exist")
            stmt = stmt.where(
                (AuditEntry.timestamp < cursor.timestamp)
                | ((AuditEntry.timestamp == cursor.timestamp) & (AuditEntry.id < cursor.id))
            )
        # Secondary sort key: entries written in the same transaction can share a
        # timestamp, and an unstable order would let offset-based paging repeat
        # or skip rows across calls.
        stmt = stmt.order_by(AuditEntry.timestamp.desc(), AuditEntry.id.desc())
        if before_id is None:
            stmt = stmt.offset(offset)
        stmt = stmt.limit(effective_limit)
        result = await db.execute(stmt)
        entries = list(result.scalars().all())
        return {
            "entries": [_entry_to_dict(entry) for entry in entries],
            "next_before_id": entries[-1].id if len(entries) == effective_limit else None,
        }


async def list_audit_resource_types(session_factory: Any) -> dict:
    """Distinct ``resource_type`` values seen so far."""
    async with session_factory() as db:
        result = await db.execute(select(AuditEntry.resource_type).distinct().order_by(AuditEntry.resource_type))
        return {"resource_types": list(result.scalars().all())}
