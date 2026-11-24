"""Admin tools for settings, the audit trail and integration clients.

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from app.mcp.admin import audit as mcp_admin_audit
from app.mcp.admin import integration_clients as mcp_admin_integration_clients
from app.mcp.admin import settings as mcp_admin_settings
from app.mcp.tools.base import McpBackendBase
from app.services.integration_clients_service import DEFAULT_RATE_LIMIT_PER_MINUTE


class PlatformTools(McpBackendBase):
    """Admin tools for settings, the audit trail and integration clients."""

    async def get_settings(self) -> dict:
        """Return site-wide settings (currently just maintenance mode). No authentication required."""
        return await mcp_admin_settings.get_settings(self.session_factory)

    async def set_member_indicators(
        self, member_limit: int | None = None, member_inactivity_months: int | None = None
    ) -> dict:
        """Replace both member indicators; null switches one off. Requires admin."""
        self._require_admin()
        return await mcp_admin_settings.set_member_indicators(
            self.session_factory,
            self._actor(),
            member_limit=member_limit,
            member_inactivity_months=member_inactivity_months,
        )

    async def set_maintenance_mode(self, maintenance_mode: bool) -> dict:
        """Toggle maintenance mode site-wide. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_settings.set_maintenance_mode(
            self.session_factory, self._actor(), maintenance_mode=maintenance_mode
        )

    async def list_audit_entries(
        self,
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
        """List audit entries (newest first), with optional filters. Requires the ``admin`` role.

        ``since``/``until`` are ISO-8601 timestamps. ``limit`` defaults to 100 and is
        capped at 1000 — the audit table only grows, so it is never unbounded.
        """
        self._require_admin()
        return await mcp_admin_audit.list_audit_entries(
            self.session_factory,
            resource_type=resource_type,
            resource_id=resource_id,
            actor=actor,
            action=action,
            since=since,
            until=until,
            limit=limit,
            offset=offset,
            before_id=before_id,
        )

    async def list_audit_resource_types(self) -> dict:
        """Return the distinct ``resource_type`` values seen in the audit trail so far.

        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_audit.list_audit_resource_types(self.session_factory)

    async def create_integration_client(
        self,
        name: str,
        allowed_role: str,
        rate_limit_per_minute: int = DEFAULT_RATE_LIMIT_PER_MINUTE,
    ) -> dict:
        """Create a managed integration-client credential for MCP automation.

        Returns the new client's details plus its raw key — shown exactly
        once here, never recoverable afterward (only its hash is stored).
        ``allowed_role`` must be ``"admin"`` or ``"volunteer"``; a credential
        can never be created more privileged than the caller's own tier.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_integration_clients.create_integration_client(
            self.session_factory,
            self._actor(),
            name=name,
            allowed_role=allowed_role,
            rate_limit_per_minute=rate_limit_per_minute,
        )

    async def list_integration_clients(self) -> dict:
        """List all managed integration clients (never includes key material). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_integration_clients.list_integration_clients(self.session_factory)

    async def revoke_integration_client(self, client_id: str) -> dict:
        """Revoke (disable) a managed integration client. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_integration_clients.revoke_integration_client(
            self.session_factory, self._actor(), client_id
        )

    async def rotate_integration_client(self, client_id: str) -> dict:
        """Replace an active integration client's credential with a freshly generated one.

        Returns the client's details plus the new raw key (shown exactly once).
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_integration_clients.rotate_integration_client(
            self.session_factory, self._actor(), client_id
        )
