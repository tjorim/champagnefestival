"""Both MCP credential types over the stateless HTTP transport, through ``MultiAuth``.

FastMCP 4.1 qualifies a ``MultiAuth`` client ID by the source that verified it.
The application keeps no MCP sessions or protocol tasks (the mount is stateless)
and resolves role, actor and audit source from token *claims*, so an integration
client and a Keycloak-style JWT must each still resolve exactly as before.
"""

from __future__ import annotations

import httpx2
import pytest
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from fastmcp.server.auth import MultiAuth, RemoteAuthProvider
from fastmcp.server.auth.providers.jwt import JWTVerifier, RSAKeyPair
from pydantic import AnyHttpUrl
from sqlalchemy import select

from app.mcp.integration_auth import IntegrationKeyTokenVerifier
from app.mcp_server import create_mcp_server
from app.models import AuditEntry
from app.services import integration_clients_service as ics
from tests.helpers import mcp_session_factory

ISSUER = "https://auth.example/realms/champagnefestival"
BASE_URL = "http://mcp.test"


KEYS = RSAKeyPair.generate()


def _build_app(db_session):
    provider = RemoteAuthProvider(
        token_verifier=JWTVerifier(public_key=KEYS.public_key, issuer=ISSUER),
        authorization_servers=[AnyHttpUrl(ISSUER)],
        base_url=BASE_URL,
    )
    factory = mcp_session_factory(db_session)
    auth = MultiAuth(server=provider, verifiers=[IntegrationKeyTokenVerifier(factory)])
    return create_mcp_server(session_factory=factory, auth=auth).http_app(path="/", stateless_http=True)


async def _call(db_session, token: str, tool: str, arguments: dict | None = None, *, proxied: bool = False):
    app = _build_app(db_session)

    def client_factory(headers=None, timeout=None, auth=None, **_kwargs):
        return httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app),
            headers=headers,
            timeout=timeout or httpx2.Timeout(30),
            auth=auth,
            follow_redirects=True,
        )

    async with app.router.lifespan_context(app):
        transport = StreamableHttpTransport(f"{BASE_URL}/", auth=token, httpx_client_factory=client_factory)
        async with Client(transport) as client:
            if proxied:
                return await client.call_tool("call_tool", {"name": tool, "arguments": arguments or {}})
            return await client.call_tool(tool, arguments or {})


def _keycloak_token(roles: list[str]) -> str:
    return KEYS.create_token(
        subject="keycloak-user-1",
        issuer=ISSUER,
        additional_claims={"realm_access": {"roles": roles}},
    )


@pytest.mark.anyio
async def test_keycloak_jwt_resolves_its_realm_role(db_session):
    result = await _call(db_session, _keycloak_token(["admin"]), "whoami")

    assert result.structured_content["role"] == "admin"


@pytest.mark.anyio
@pytest.mark.parametrize("allowed_role", ["volunteer", "admin"])
async def test_integration_client_resolves_its_allowed_role(db_session, allowed_role):
    _client, key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="Home Assistant", allowed_role=allowed_role
    )

    result = await _call(db_session, key, "whoami")

    assert result.structured_content["role"] == allowed_role


@pytest.mark.anyio
async def test_admin_write_is_audited_with_each_credentials_own_identity(db_session):
    client_row, key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="Seating bot", allowed_role="admin"
    )

    await _call(db_session, key, "create_venue", {"name": "Integration Venue"}, proxied=True)
    await _call(db_session, _keycloak_token(["admin"]), "create_venue", {"name": "Keycloak Venue"}, proxied=True)

    entries = {
        e.auth_source: e
        for e in (await db_session.execute(select(AuditEntry).where(AuditEntry.action == "venue_created"))).scalars()
    }
    assert entries["integration"].subject == f"integration:{client_row['id']}"
    assert entries["keycloak"].subject == "keycloak-user-1"


@pytest.mark.anyio
@pytest.mark.parametrize("credential", [None, "not-a-valid-token", "revoked"])
async def test_missing_invalid_and_revoked_credentials_are_refused(db_session, credential):
    if credential == "revoked":
        client_row, credential = await ics.create_integration_client(
            db_session, actor="admin-1", creator_role="admin", name="Retired", allowed_role="volunteer"
        )
        await ics.revoke_integration_client(db_session, actor="admin-1", client_id=client_row["id"])
    app = _build_app(db_session)
    headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
    if credential is not None:
        headers["Authorization"] = f"Bearer {credential}"

    async with (
        app.router.lifespan_context(app),
        httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url=BASE_URL) as http,
    ):
        response = await http.post("/", headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": "ping"})

    assert response.status_code == 401
