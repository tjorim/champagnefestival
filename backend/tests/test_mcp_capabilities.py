"""Tests for the MCP capabilities manifest (issue #807).

Guards against drift between the advertised tool/role manifest and the
actual live tool registration in ``create_mcp_server()`` — the acceptance
criterion is "Capability output is generated from or verified against actual
MCP registration."
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.mcp_server import (
    PUBLIC_TOOL_NAMES,
    ROLE_ADMIN,
    ROLE_PUBLIC,
    ROLE_VOLUNTEER,
    VOLUNTEER_TOOL_NAMES,
    create_mcp_server,
    get_mcp_capabilities,
)


@pytest.mark.anyio
async def test_capabilities_manifest_covers_every_registered_tool_exactly_once():
    mcp = create_mcp_server(session_factory=MagicMock())
    registered = {tool.name for tool in await mcp.list_tools()}

    manifest = await get_mcp_capabilities(mcp)
    manifest_names = {entry["name"] for entry in manifest["tools"]}

    # Generated directly off mcp.list_tools(), so this can't drift by
    # construction — asserted anyway as a regression guard on that invariant.
    assert manifest_names == registered


def test_public_and_volunteer_tool_allowlists_are_disjoint():
    assert PUBLIC_TOOL_NAMES.isdisjoint(VOLUNTEER_TOOL_NAMES)


@pytest.mark.anyio
async def test_public_and_volunteer_allowlists_only_reference_real_tools():
    """Catches a typo'd or removed tool name lingering in the allowlists —
    every name in PUBLIC_TOOL_NAMES/VOLUNTEER_TOOL_NAMES must correspond to an
    actually-registered tool, otherwise the manifest would silently omit it."""
    mcp = create_mcp_server(session_factory=MagicMock())
    registered = {tool.name for tool in await mcp.list_tools()}

    assert registered >= PUBLIC_TOOL_NAMES
    assert registered >= VOLUNTEER_TOOL_NAMES


@pytest.mark.anyio
async def test_capabilities_manifest_required_roles_are_valid_and_sorted():
    mcp = create_mcp_server(session_factory=MagicMock())
    manifest = await get_mcp_capabilities(mcp)

    names = [entry["name"] for entry in manifest["tools"]]
    assert names == sorted(names)
    assert all(entry["required_role"] in (ROLE_PUBLIC, ROLE_VOLUNTEER, ROLE_ADMIN) for entry in manifest["tools"])


@pytest.mark.anyio
async def test_capabilities_manifest_spot_checks_known_tiers():
    mcp = create_mcp_server(session_factory=MagicMock())
    manifest = await get_mcp_capabilities(mcp)
    role_by_name = {entry["name"]: entry["required_role"] for entry in manifest["tools"]}

    assert role_by_name["whoami"] == ROLE_PUBLIC
    assert role_by_name["get_active_edition"] == ROLE_PUBLIC
    assert role_by_name["find_guest"] == ROLE_VOLUNTEER
    assert role_by_name["get_check_in_summary"] == ROLE_VOLUNTEER
    assert role_by_name["create_venue"] == ROLE_ADMIN
    assert role_by_name["create_integration_client"] == ROLE_ADMIN


# ---------------------------------------------------------------------------
# /api/mcp/capabilities REST endpoint
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_mcp_capabilities_endpoint_reports_disabled_when_mcp_not_mounted(client):
    # The test app's settings.mcp_base_url is unset, so app.main._mcp is None.
    r = await client.get("/api/mcp/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False
    assert body["tools"] == []
    assert body["mount_path"] == "/mcp"


@pytest.mark.anyio
async def test_mcp_capabilities_endpoint_reports_enabled_tool_list(client, monkeypatch):
    import app.main as main_module

    fake_mcp = create_mcp_server(session_factory=MagicMock())
    monkeypatch.setattr(main_module, "_mcp", fake_mcp)

    r = await client.get("/api/mcp/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True
    assert any(t["name"] == "whoami" for t in body["tools"])
    assert any(t["name"] == "create_venue" and t["required_role"] == "admin" for t in body["tools"])
