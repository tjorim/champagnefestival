"""Tests for the MCP capabilities manifest (issue #807).

Guards against drift between the advertised tool/role manifest and the
actual live tool registration in ``create_mcp_server()`` — the acceptance
criterion is "Capability output is generated from or verified against actual
MCP registration."
"""

from __future__ import annotations

from typing import Any, cast
from unittest.mock import MagicMock

import pytest

from app.mcp.capabilities import (
    PUBLIC_TOOL_NAMES,
    ROLE_ADMIN,
    ROLE_PUBLIC,
    ROLE_VOLUNTEER,
    TOOL_EFFECT_READ,
    TOOL_EFFECT_WRITE,
    VOLUNTEER_TOOL_NAMES,
    get_mcp_capabilities,
    tool_annotations,
    tool_effect,
)
from app.mcp_server import create_mcp_server


@pytest.mark.anyio
async def test_capabilities_manifest_covers_every_registered_tool_exactly_once():
    mcp = create_mcp_server(session_factory=MagicMock())
    registered = {tool.name for tool in await mcp.list_tools()}

    manifest = cast(dict[str, Any], await get_mcp_capabilities(mcp))
    manifest_names = {entry["name"] for entry in cast(list[dict[str, Any]], manifest["tools"])}

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
    manifest = cast(dict[str, Any], await get_mcp_capabilities(mcp))

    tools = cast(list[dict[str, Any]], manifest["tools"])
    names = [entry["name"] for entry in tools]
    assert names == sorted(names)
    assert all(entry["required_role"] in (ROLE_PUBLIC, ROLE_VOLUNTEER, ROLE_ADMIN) for entry in tools)
    assert all(entry["effect"] in (TOOL_EFFECT_READ, TOOL_EFFECT_WRITE) for entry in tools)


@pytest.mark.anyio
async def test_capabilities_manifest_spot_checks_known_tiers():
    mcp = create_mcp_server(session_factory=MagicMock())
    manifest = cast(dict[str, Any], await get_mcp_capabilities(mcp))
    role_by_name = {entry["name"]: entry["required_role"] for entry in cast(list[dict[str, Any]], manifest["tools"])}

    assert role_by_name["whoami"] == ROLE_PUBLIC
    assert role_by_name["get_active_edition"] == ROLE_PUBLIC
    assert role_by_name["find_guest"] == ROLE_VOLUNTEER
    assert role_by_name["get_check_in_summary"] == ROLE_VOLUNTEER
    assert role_by_name["create_venue"] == ROLE_ADMIN
    assert role_by_name["create_integration_client"] == ROLE_ADMIN


@pytest.mark.anyio
async def test_capabilities_manifest_classifies_side_effects_conservatively():
    mcp = create_mcp_server(session_factory=MagicMock())
    manifest = cast(dict[str, Any], await get_mcp_capabilities(mcp))
    effect_by_name = {entry["name"]: entry["effect"] for entry in cast(list[dict[str, Any]], manifest["tools"])}

    assert effect_by_name["whoami"] == TOOL_EFFECT_READ
    assert effect_by_name["get_active_edition"] == TOOL_EFFECT_READ
    assert effect_by_name["list_audit_entries"] == TOOL_EFFECT_READ
    assert effect_by_name["create_venue"] == TOOL_EFFECT_WRITE
    assert effect_by_name["rotate_integration_client"] == TOOL_EFFECT_WRITE
    assert tool_effect("future_tool_without_policy") == TOOL_EFFECT_WRITE


@pytest.mark.anyio
async def test_registered_tools_advertise_explicit_safety_annotations():
    mcp = create_mcp_server(session_factory=MagicMock())
    tools = await mcp.list_tools()

    assert tools
    for tool in tools:
        annotations = tool.annotations
        assert annotations is not None
        expected_read_only = tool_effect(tool.name) == TOOL_EFFECT_READ
        assert annotations.read_only_hint is expected_read_only
        assert annotations.open_world_hint is False
        if expected_read_only:
            assert annotations.destructive_hint is False
            assert annotations.idempotent_hint is True


def test_write_annotations_distinguish_creation_from_destructive_changes():
    create = tool_annotations("create_edition")
    update = tool_annotations("update_edition")
    delete = tool_annotations("delete_edition")
    unknown = tool_annotations("future_tool_without_policy")

    assert create.read_only_hint is False
    assert create.destructive_hint is False
    assert update.destructive_hint is True
    assert delete.destructive_hint is True
    assert unknown.read_only_hint is False
    assert unknown.destructive_hint is True


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
