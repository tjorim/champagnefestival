"""FastMCP authentication composition for Champagnefestival."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import settings


def build_keycloak_auth(session_factory: async_sessionmaker | None = None) -> Any:
    """Compose Keycloak and managed integration-client authentication."""
    mcp_base_url = settings.mcp_base_url
    if not mcp_base_url:
        return None
    if not settings.oidc_issuer_url:
        raise RuntimeError("OIDC_ISSUER_URL is required when MCP_BASE_URL enables the HTTP MCP server")

    from fastmcp.server.auth import MultiAuth
    from fastmcp.server.auth.providers.keycloak import KeycloakAuthProvider

    from app.mcp.integration_auth import IntegrationKeyTokenVerifier

    if session_factory is None:
        from app.database import async_session_factory

        session_factory = async_session_factory

    keycloak_provider = KeycloakAuthProvider(
        realm_url=settings.oidc_issuer_url,
        base_url=mcp_base_url,
        audience=settings.oidc_audience or None,
        required_scopes=[],
    )
    return MultiAuth(server=keycloak_provider, verifiers=[IntegrationKeyTokenVerifier(session_factory)])
