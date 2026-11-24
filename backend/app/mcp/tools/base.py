"""Shared base of the MCP backend: the session factory and caller resolution (role, actor, auth source)."""

from __future__ import annotations

from typing import Any

from fastmcp.server.dependencies import get_access_token
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.mcp.capabilities import ROLE_ADMIN, ROLE_PUBLIC, ROLE_VOLUNTEER


class McpBackendBase:
    """Resolves the caller from the FastMCP access token for every tool mixin.

    Parameters
    ----------
    session_factory:
        An ``async_sessionmaker`` that produces ``AsyncSession`` instances.
    """

    def __init__(self, session_factory: async_sessionmaker) -> None:
        self.session_factory = session_factory

    def _resolve_role(self) -> str:
        """Resolve the caller's role from the FastMCP access token.

        Returns ``'admin'``, ``'volunteer'``, or ``'public'``.
        """
        token = get_access_token()
        if token is None:
            return ROLE_PUBLIC
        claims: dict[str, Any] = getattr(token, "claims", {})
        realm_access = claims.get("realm_access")
        roles: list[str] = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
        if not isinstance(roles, list):
            roles = []
        if ROLE_ADMIN in roles:
            return ROLE_ADMIN
        if ROLE_VOLUNTEER in roles:
            return ROLE_VOLUNTEER
        return ROLE_PUBLIC

    def _require_volunteer(self) -> str:
        """Raise ``PermissionError`` for unauthenticated callers.

        Returns the resolved role (``'admin'`` or ``'volunteer'``).
        """
        role = self._resolve_role()
        if role == ROLE_PUBLIC:
            raise PermissionError("Authentication required: this tool is only available to volunteers and admins.")
        return role

    def _require_admin(self) -> str:
        """Raise ``PermissionError`` unless the caller has the ``admin`` role.

        Mirrors ``require_admin`` on the equivalent REST endpoints — every
        write tool is admin-only. Returns ``'admin'`` for symmetry with
        ``_require_volunteer``.
        """
        role = self._resolve_role()
        if role != ROLE_ADMIN:
            raise PermissionError("Authentication required: this tool is only available to admins.")
        return role

    def _actor(self) -> str:
        """Return the OIDC ``sub`` claim for audit logging, or ``'anonymous'``.

        MCP equivalent of ``app.core.auth.get_actor_id`` — there is no ``request.state``
        to read from, so this reads the ``sub`` claim directly off the access token.
        """
        token = get_access_token()
        if token is None:
            return "anonymous"
        claims: dict[str, Any] = getattr(token, "claims", {})
        sub = claims.get("sub")
        return str(sub) if sub is not None else "anonymous"

    def _auth_source(self) -> str:
        """Return ``'keycloak'``, ``'integration'``, or ``'none'`` for the current caller.

        ``IntegrationKeyTokenVerifier`` stamps ``claims['auth_source'] =
        'integration'`` on tokens it verifies (see ``app.mcp.integration_auth``);
        a Keycloak-issued JWT never carries that claim, so its absence on an
        authenticated token means Keycloak.
        """
        token = get_access_token()
        if token is None:
            return "none"
        claims: dict[str, Any] = getattr(token, "claims", {})
        return "integration" if claims.get("auth_source") == "integration" else "keycloak"
