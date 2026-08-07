"""Tests for the admin (write) integration-client MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import integration_clients as mcp_integration_clients
from tests.helpers import mcp_session_factory


@pytest.mark.anyio
async def test_create_list_revoke_rotate(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_integration_clients.create_integration_client(
        factory, "admin-1", name="Home Assistant", allowed_role="volunteer"
    )
    assert created["allowed_role"] == "volunteer"
    assert created["key"].startswith("cfic_")
    client_id = created["id"]

    listed = await mcp_integration_clients.list_integration_clients(factory)
    assert any(c["id"] == client_id for c in listed["integration_clients"])
    assert "key" not in listed["integration_clients"][0]

    rotated = await mcp_integration_clients.rotate_integration_client(factory, "admin-1", client_id)
    assert rotated["key"] != created["key"]

    revoked = await mcp_integration_clients.revoke_integration_client(factory, "admin-1", client_id)
    assert revoked["is_active"] is False


@pytest.mark.anyio
async def test_create_rejects_invalid_role(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="allowed_role"):
        await mcp_integration_clients.create_integration_client(factory, "admin-1", name="X", allowed_role="public")


@pytest.mark.anyio
async def test_revoke_unknown_client(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_integration_clients.revoke_integration_client(factory, "admin-1", "nonexistent")
