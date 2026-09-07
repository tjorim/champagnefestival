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
    auth_source: str | None = None,
) -> None:
    """Add an audit entry to the session.

    Does not commit — caller commits as part of the same transaction.

    ``auth_source`` is normally inferred from ``actor`` via
    ``audit_provenance``, which only distinguishes "anonymous", an
    integration client, or an OIDC subject. It has no case for the other
    value ``actor`` legitimately holds per ``AuditEntry.actor``'s own
    docstring — a client IP, for a token-gated action with no OIDC subject at
    all (e.g. guest-token check-in). Passing ``auth_source`` explicitly for
    that case (rather than falling through to the "keycloak" default, which
    would mislabel an IP as an OIDC subject) is what lets the 30-day
    IP-blanking sweep in docs/decisions/934-data-retention-and-erasure.md
    target exactly those rows without also touching real staff actions.
    """
    if auth_source is not None:
        subject, integration_client_id = None, None
    else:
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
