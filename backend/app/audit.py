"""Operational audit trail helpers."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEntry
from app.utils import make_id


def audit_provenance(actor: str) -> tuple[str, str | None, str | None]:
    """Derive structured provenance from the established actor vocabulary."""
    if actor == "anonymous":
        return "none", None, None
    if actor.startswith("integration:"):
        return "integration", actor, actor.removeprefix("integration:")
    return "keycloak", actor, None


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
    auth_source, subject, integration_client_id = audit_provenance(actor)
    db.add(
        AuditEntry(
            id=make_id("aud"),
            actor=actor,
            auth_source=auth_source,
            subject=subject,
            integration_client_id=integration_client_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            details=details or {},
        )
    )
