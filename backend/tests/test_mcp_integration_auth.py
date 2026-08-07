"""Tests for IntegrationKeyTokenVerifier — the FastMCP TokenVerifier that
authenticates managed integration-client credentials (issue #807)."""

from __future__ import annotations

import pytest

from app.mcp.integration_auth import IntegrationKeyTokenVerifier
from app.services import integration_clients_service as ics
from tests.helpers import mcp_session_factory


@pytest.mark.anyio
async def test_verify_token_returns_access_token_with_synthesised_claims(db_session):
    _client_dict, raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="Home Assistant", allowed_role="volunteer"
    )
    verifier = IntegrationKeyTokenVerifier(mcp_session_factory(db_session))

    access_token = await verifier.verify_token(raw_key)

    assert access_token is not None
    assert access_token.claims["realm_access"]["roles"] == ["volunteer"]
    assert access_token.claims["sub"].startswith("integration:")
    assert access_token.claims["auth_source"] == "integration"
    assert access_token.client_id == access_token.claims["sub"]
    assert access_token.scopes == []


@pytest.mark.anyio
async def test_verify_token_rejects_unknown_token(db_session):
    verifier = IntegrationKeyTokenVerifier(mcp_session_factory(db_session))
    assert await verifier.verify_token(f"{ics.TOKEN_PREFIX}bogus") is None


@pytest.mark.anyio
async def test_verify_token_rejects_revoked_client(db_session):
    client_dict, raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    await ics.revoke_integration_client(db_session, actor="admin-1", client_id=client_dict["id"])
    verifier = IntegrationKeyTokenVerifier(mcp_session_factory(db_session))

    assert await verifier.verify_token(raw_key) is None


@pytest.mark.anyio
async def test_verify_token_admin_tier_client_resolves_admin_role(db_session):
    _client_dict, raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="admin"
    )
    verifier = IntegrationKeyTokenVerifier(mcp_session_factory(db_session))

    access_token = await verifier.verify_token(raw_key)

    assert access_token is not None
    assert access_token.claims["realm_access"]["roles"] == ["admin"]


@pytest.mark.anyio
async def test_verify_token_never_leaks_key_hash_in_claims(db_session):
    _client_dict, raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    verifier = IntegrationKeyTokenVerifier(mcp_session_factory(db_session))

    access_token = await verifier.verify_token(raw_key)

    assert access_token is not None
    serialized = str(access_token.claims)
    assert raw_key not in serialized
    assert "key_hash" not in serialized
