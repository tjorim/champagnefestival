"""Operational audit trail helpers."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEntry
from app.utils import make_id


async def write_audit_entry(
    db: AsyncSession,
    *,
    actor: str,
    action: str,
    resource_type: str,
    resource_id: str,
    request_id: str | None = None,
    details: dict | None = None,
) -> None:
    """Add an audit entry to the session.

    Does not commit — caller commits as part of the same transaction.
    """
    db.add(
        AuditEntry(
            id=make_id("aud"),
            actor=actor,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            details=details or {},
        )
    )
