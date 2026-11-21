"""The MCP entry point: ``python -m app.mcp_server`` and ``from app.mcp_server import ...``.

The server lives in ``app.mcp.server`` (next to the tool modules in ``app.mcp``). This module is kept at its old path
because MCP clients and docs/integrations/LOCAL_MCP_SERVER.md start the stdio server with ``python -m app.mcp_server``;
it only re-exports the public names and runs the stdio entry point. Application code imports ``app.mcp.server``."""

from app.mcp.capabilities import ROLE_ADMIN, ROLE_PUBLIC, ROLE_VOLUNTEER
from app.mcp.server import (
    ALWAYS_VISIBLE_TOOLS,
    CALL_TOOL_NAME,
    SEARCH_TOOL_NAME,
    ChampagneFestivalMcpBackend,
    _run_stdio,
    build_keycloak_auth,
    create_mcp_server,
)

__all__ = [
    "ALWAYS_VISIBLE_TOOLS",
    "CALL_TOOL_NAME",
    "ROLE_ADMIN",
    "ROLE_PUBLIC",
    "ROLE_VOLUNTEER",
    "SEARCH_TOOL_NAME",
    "ChampagneFestivalMcpBackend",
    "_run_stdio",
    "build_keycloak_auth",
    "create_mcp_server",
]

if __name__ == "__main__":  # pragma: no cover
    _run_stdio()
