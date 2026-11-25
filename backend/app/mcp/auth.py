"""FastMCP authentication composition for Champagnefestival."""

from __future__ import annotations

from typing import Any

from fastmcp.server.auth import AccessToken, JWTVerifier
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import settings


class McpJwtVerifier(JWTVerifier):
    """Require the expiry claim in addition to FastMCP's JWT validation."""

    async def verify_token(self, token: str) -> AccessToken | None:
        verified = await super().verify_token(token)
        if verified is None or verified.expires_at is None:
            return None
        return verified


def build_keycloak_auth(session_factory: async_sessionmaker | None = None) -> Any:
    """Compose Keycloak and managed integration-client authentication.

    OAuth access tokens must carry the canonical MCP resource URL as their
    audience. The REST API audience (``OIDC_AUDIENCE``) is deliberately not
    accepted here, so a web or Android token cannot call MCP tools.
    """
    resource_url = settings.mcp_resource_url
    if not resource_url:
        return None
    if not settings.oidc_issuer_url:
        raise RuntimeError("OIDC_ISSUER_URL is required when MCP_RESOURCE_URL enables the HTTP MCP server")

    from fastmcp.server.auth import MultiAuth
    from fastmcp.server.auth.providers.keycloak import KeycloakAuthProvider

    from app.mcp.integration_auth import IntegrationKeyTokenVerifier

    if session_factory is None:
        from app.db.session import async_session_factory

        session_factory = async_session_factory

    issuer = settings.oidc_issuer_url.rstrip("/")
    keycloak_provider = KeycloakAuthProvider(
        realm_url=issuer,
        base_url=resource_url,
        token_verifier=McpJwtVerifier(
            jwks_uri=f"{issuer}/protocol/openid-connect/certs",
            issuer=issuer,
            algorithm="RS256",
            audience=resource_url,
        ),
        required_scopes=[],
    )
    return MultiAuth(server=keycloak_provider, verifiers=[IntegrationKeyTokenVerifier(session_factory)])
