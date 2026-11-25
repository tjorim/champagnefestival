"""Both MCP credential types over the stateless HTTP transport, through ``MultiAuth``.

FastMCP 4.1 qualifies a ``MultiAuth`` client ID by the source that verified it.
The application keeps no MCP sessions or protocol tasks (the mount is stateless)
and resolves role, actor and audit source from token *claims*, so an integration
client and a Keycloak-style JWT must each still resolve exactly as before.
"""

from __future__ import annotations

import time
from typing import cast

import httpx2
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from fastmcp.server.auth.providers.jwt import JWTVerifier, RSAKeyPair
from jwt.algorithms import RSAAlgorithm
from sqlalchemy import select

from app.core.config import settings
from app.mcp.auth import build_keycloak_auth
from app.mcp.server import create_mcp_server
from app.models import AuditEntry
from app.services import integration_clients_service as ics
from tests.helpers import mcp_session_factory

ISSUER = "https://auth.example/realms/champagnefestival"
BASE_URL = "http://mcp.test"
RESOURCE = "https://api.example/mcp/"


KEYS = RSAKeyPair.generate()
PUBLIC_KEY = cast(RSAPublicKey, serialization.load_pem_public_key(KEYS.public_key.encode()))
JWKS = {"keys": [RSAAlgorithm.to_jwk(PUBLIC_KEY, as_dict=True)]}


@pytest.fixture(autouse=True)
def keycloak_settings(monkeypatch: pytest.MonkeyPatch):
    """Run the real Keycloak provider (as production does) against a stubbed JWKS endpoint."""
    monkeypatch.setattr(settings, "oidc_issuer_url", ISSUER)
    monkeypatch.setattr(settings, "oidc_audience", "champagnefestival")
    monkeypatch.setattr(settings, "mcp_resource_url", RESOURCE)

    async def fetch_jwks(verifier: JWTVerifier):
        assert verifier.jwks_uri == f"{ISSUER}/protocol/openid-connect/certs"
        return JWKS

    monkeypatch.setattr(JWTVerifier, "_fetch_jwks", fetch_jwks)


def _build_app(db_session):
    factory = mcp_session_factory(db_session)
    auth = build_keycloak_auth(session_factory=factory)
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


def _keycloak_token(
    roles: list[str],
    *,
    audience: str | list[str] | None = None,
    issuer: str = ISSUER,
    expires_in_seconds: int = 3600,
) -> str:
    return KEYS.create_token(
        subject="keycloak-user-1",
        issuer=issuer,
        audience=audience if audience is not None else [RESOURCE, "account"],
        expires_in_seconds=expires_in_seconds,
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
    assert entries["integration"].subject == f"integration:{client_row.id}"
    assert entries["keycloak"].subject == "keycloak-user-1"


@pytest.mark.anyio
async def test_transport_stays_stateless(db_session):
    # Stateless HTTP keeps no MCP session, so the SDK's 30-minute idle expiry has nothing to expire.
    _client, key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="Stateless", allowed_role="volunteer"
    )
    app = _build_app(db_session)
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}},
    }
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
    }

    async with (
        app.router.lifespan_context(app),
        httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url=BASE_URL) as http,
    ):
        response = await http.post("/", headers=headers, json=initialize)

    assert response.status_code == 200
    assert "mcp-session-id" not in response.headers


@pytest.mark.anyio
@pytest.mark.parametrize("credential", [None, "not-a-valid-token", "revoked"])
async def test_missing_invalid_and_revoked_credentials_are_refused(db_session, credential):
    if credential == "revoked":
        client_row, credential = await ics.create_integration_client(
            db_session, actor="admin-1", creator_role="admin", name="Retired", allowed_role="volunteer"
        )
        await ics.revoke_integration_client(db_session, actor="admin-1", client_id=client_row.id)
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


@pytest.mark.anyio
async def test_oauth_tokens_must_carry_the_mcp_resource_url_as_audience(db_session):
    """Web and Android tokens carry the REST API audience and must not authenticate MCP."""
    app = _build_app(db_session)
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}},
    }
    headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
    no_expiry = jwt.encode(
        {"sub": "keycloak-user-1", "iss": ISSUER, "aud": [RESOURCE, "account"]},
        KEYS.private_key.get_secret_value(),
        algorithm="RS256",
    )
    bad_signature = jwt.encode(
        {"sub": "x", "iss": ISSUER, "aud": RESOURCE, "exp": int(time.time()) + 300},
        RSAKeyPair.generate().private_key.get_secret_value(),
        algorithm="RS256",
    )
    tokens = {
        "api_audience": _keycloak_token(["admin"], audience="champagnefestival"),
        "api_audience_list": _keycloak_token(["admin"], audience=["champagnefestival", "account"]),
        "other_resource": _keycloak_token(["admin"], audience=["https://other.example/mcp/", "account"]),
        "resource_without_slash": _keycloak_token(["admin"], audience="https://api.example/mcp"),
        "wrong_issuer": _keycloak_token(["admin"], issuer="https://another-issuer.example"),
        "expired": _keycloak_token(["admin"], expires_in_seconds=-60),
        "no_expiry": no_expiry,
        "bad_signature": bad_signature,
        # Keycloak lists "account" next to the resource; membership is what counts.
        "accepted": _keycloak_token(["admin"]),
    }

    statuses = {}
    async with (
        app.router.lifespan_context(app),
        httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url=BASE_URL) as http,
    ):
        for label, token in tokens.items():
            response = await http.post("/", headers={**headers, "Authorization": f"Bearer {token}"}, json=initialize)
            statuses[label] = response.status_code
        metadata = await http.get("/.well-known/oauth-protected-resource/mcp/")

    assert statuses == {**dict.fromkeys(tokens, 401), "accepted": 200}
    assert metadata.status_code == 200
    assert metadata.json()["resource"] == RESOURCE
    assert metadata.json()["authorization_servers"] == [ISSUER]
