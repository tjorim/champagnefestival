"""Authoritative MCP capability metadata derived from live registration."""

from __future__ import annotations

from fastmcp import FastMCP
from fastmcp.server.auth import AuthCheck, AuthContext, require_roles
from mcp.types import ToolAnnotations

from app.config import settings
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
_NON_DESTRUCTIVE_WRITE_PREFIXES = ("copy_", "create_", "bulk_create_")
_INTERACTIVE_ADMIN_TOOLS = frozenset(
    {
        "create_integration_client",
        "list_integration_clients",
        "rotate_integration_client",
        "revoke_integration_client",
    }
)


def _keycloak_roles(claims: dict[str, object]) -> list[str]:
    """Extract string roles from Keycloak's ``realm_access`` claim."""
    realm_access = claims.get("realm_access")
    if not isinstance(realm_access, dict):
        return []
    roles = realm_access.get("roles")
    if not isinstance(roles, list):
        return []
    return [role for role in roles if isinstance(role, str)]


_require_admin = require_roles(ROLE_ADMIN, extract=_keycloak_roles)


def _require_volunteer_or_admin(ctx: AuthContext) -> bool:
    """Allow the event-day tier and admins, which inherit volunteer access."""
    if ctx.token is None:
        return False
    roles = set(_keycloak_roles(ctx.token.claims))
    return bool({ROLE_VOLUNTEER, ROLE_ADMIN} & roles)


def _require_interactive_admin(ctx: AuthContext) -> bool:
    """Allow human admins, but not managed keys or Keycloak service accounts."""
    if ctx.token is None:
        return False
    claims = ctx.token.claims
    if claims.get("auth_source") == "integration":
        return False
    username = claims.get("preferred_username")
    if isinstance(username, str) and username.startswith("service-account-"):
        return False
    authorized_party = claims.get("azp")
    interactive_client_ids = {
        client_id.strip() for client_id in settings.mcp_interactive_client_ids.split(",") if client_id.strip()
    }
    if authorized_party not in interactive_client_ids:
        return False
    return ROLE_ADMIN in _keycloak_roles(claims)


def tool_required_role(tool_name: str) -> str:
    """Return a tool's minimum role, defaulting unknown tools to admin."""
    if tool_name in PUBLIC_TOOL_NAMES:
        return ROLE_PUBLIC
    if tool_name in VOLUNTEER_TOOL_NAMES:
        return ROLE_VOLUNTEER
    return ROLE_ADMIN


def tool_auth(tool_name: str) -> AuthCheck | None:
    """Return native component authorization for the tool's minimum role.

    Public tools need no component-level check because the configured MCP auth
    provider already requires a valid bearer token. Unknown tools default to
    the admin check through ``tool_required_role``.
    """
    required_role = tool_required_role(tool_name)
    if required_role == ROLE_PUBLIC:
        return None
    if required_role == ROLE_VOLUNTEER:
        return _require_volunteer_or_admin
    if tool_name in _INTERACTIVE_ADMIN_TOOLS:
        return _require_interactive_admin
    return _require_admin


def tool_effect(tool_name: str) -> str:
    """Classify side effects conservatively; unknown names default to write."""
    if tool_name == "whoami" or tool_name.startswith(_READ_PREFIXES):
        return TOOL_EFFECT_READ
    return TOOL_EFFECT_WRITE


def tool_annotations(tool_name: str) -> ToolAnnotations:
    """Return explicit MCP safety metadata for a registered tool.

    ChatGPT treats missing annotations conservatively, which previously put
    every Champagnefestival tool in its "write actions" group. Keep this
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
    # Read the local registry directly so this REST-facing manifest describes
    # every capability and its required role. ``mcp.list_tools()`` applies the
    # current request's component authorization and would otherwise turn this
    # into a caller-specific partial manifest.
    tools = await mcp.local_provider.list_tools()
    return {
        "tools": [
            {
                "name": tool.name,
                "effect": tool_effect(tool.name),
                "required_role": tool_required_role(tool.name),
            }
            for tool in sorted(tools, key=lambda tool: tool.name)
        ],
        "resources": [],
        "prompts": [],
    }
