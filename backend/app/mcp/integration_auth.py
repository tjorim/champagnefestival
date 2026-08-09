"""FastMCP ``TokenVerifier`` for database-backed integration-client credentials.

Combined with the Keycloak provider via ``MultiAuth`` in
``app.mcp_server.build_keycloak_auth`` so an MCP caller can present either a
Keycloak-issued JWT or an integration-client key — see issue #807.
"""

from __future__ import annotations

import logging
from typing import Any

from fastmcp.server.auth import AccessToken, TokenVerifier

from app.services.integration_clients_service import TOKEN_PREFIX, authenticate_integration_client

logger = logging.getLogger(__name__)


class IntegrationKeyTokenVerifier(TokenVerifier):
    """Verifies a bearer token against the ``integration_clients`` table.

    On success, synthesises an ``AccessToken`` whose ``claims`` shape matches
    a Keycloak-issued JWT closely enough that
    ``ChampagneFestivalMcpBackend._resolve_role()``/``_actor()`` work
    unchanged for both auth sources — no changes needed to any of the 80+
    existing tool methods:
    ``{"sub": "integration:<id>", "realm_access": {"roles": [allowed_role]}}``.
    """

    def __init__(self, session_factory: Any) -> None:
        super().__init__()
        self._session_factory = session_factory

    async def verify_token(self, token: str) -> AccessToken | None:
        if not token.startswith(TOKEN_PREFIX):
            return None

        async with self._session_factory() as db:
            client = await authenticate_integration_client(db, token)
            if client is None:
                return None
            subject = f"integration:{client.id}"
            return AccessToken(
                token=token,
                client_id=subject,
                scopes=[],
                claims={
                    "sub": subject,
                    "realm_access": {"roles": [client.allowed_role]},
                    "auth_source": "integration",
                    "integration_client_id": client.id,
                    "integration_client_name": client.name,
                },
            )
