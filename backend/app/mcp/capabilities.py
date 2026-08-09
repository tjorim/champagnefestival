"""Authoritative MCP capability metadata derived from live registration."""

from __future__ import annotations

from fastmcp import FastMCP
from mcp.types import ToolAnnotations

from app.mcp.utils import ROLE_ADMIN, ROLE_PUBLIC, ROLE_VOLUNTEER

TOOL_EFFECT_READ = "read"
TOOL_EFFECT_WRITE = "write"

# Explicit authentication allowlists. Unknown tools default to admin.
PUBLIC_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "get_active_edition",
        "list_editions",
        "get_event_schedule",
        "get_venue_plan_summary",
        "get_settings",
        "whoami",
    }
)

VOLUNTEER_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "find_guest",
        "get_guest_registration",
        "get_table_seating",
        "resolve_table_reference",
        "get_table_order_summary",
        "get_guest_order_status",
        "get_champagne_delivery_summary",
        "get_undelivered_champagne_by_table",
        "get_check_in_summary",
    }
)

_READ_PREFIXES = ("find_", "get_", "list_", "resolve_")
_NON_DESTRUCTIVE_WRITE_PREFIXES = ("copy_", "create_")


def tool_required_role(tool_name: str) -> str:
    """Return a tool's minimum role, defaulting unknown tools to admin."""
    if tool_name in PUBLIC_TOOL_NAMES:
        return ROLE_PUBLIC
    if tool_name in VOLUNTEER_TOOL_NAMES:
        return ROLE_VOLUNTEER
    return ROLE_ADMIN


def tool_effect(tool_name: str) -> str:
    """Classify side effects conservatively; unknown names default to write."""
    if tool_name == "whoami" or tool_name.startswith(_READ_PREFIXES):
        return TOOL_EFFECT_READ
    return TOOL_EFFECT_WRITE


def tool_annotations(tool_name: str) -> ToolAnnotations:
    """Return explicit MCP safety metadata for a registered tool.

    ChatGPT treats missing annotations conservatively, which previously put
    every Champagne Festival tool in its "write actions" group. Keep this
    classification derived from the same policy as the capabilities manifest
    so those two advertised surfaces cannot drift.
    """
    if tool_effect(tool_name) == TOOL_EFFECT_READ:
        return ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=False,
        )

    return ToolAnnotations(
        read_only_hint=False,
        destructive_hint=not tool_name.startswith(_NON_DESTRUCTIVE_WRITE_PREFIXES),
        open_world_hint=False,
    )


async def get_mcp_capabilities(mcp: FastMCP) -> dict[str, object]:
    """Build capability metadata from the server's live registered tools."""
    tools = await mcp.list_tools()
    return {
        "tools": [
            {
                "name": tool.name,
                "effect": tool_effect(tool.name),
                "required_role": tool_required_role(tool.name),
            }
            for tool in sorted(tools, key=lambda tool: tool.name)
        ],
    }
