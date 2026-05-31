# Local MCP Server — Champagne Festival

The Champagne Festival backend ships a read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server built with [FastMCP v3](https://gofastmcp.com/).

It exposes operational tools that allow desktop agents (Claude Desktop, Codex CLI, etc.) to answer event-day questions:

- Who sits where?
- What did this guest or table order?
- Which champagne orders are already delivered?
- Which tables still have undelivered champagne?
- How many guests are checked in?

---

## Prerequisites

- Python 3.13+
- [`uv`](https://docs.astral.sh/uv/) (recommended) or pip
- A running PostgreSQL database with the Champagne Festival schema
- Environment variables (copy `backend/.env.example` → `backend/.env` and fill in at minimum `DATABASE_URL`)

---

## Running the MCP server locally (stdio transport)

The stdio transport is designed for **local desktop agents** such as Claude Desktop or the Codex CLI. No HTTP server is started; the agent communicates with the MCP server over stdin/stdout.

```bash
cd backend
uv run python -m app.mcp_server
```

This starts the MCP server in stdio mode without authentication enforcement. All unauthenticated tool calls resolve to the `public` role (edition/event/venue overview only).

To run as a specific role (e.g., `volunteer`) in local development, you can set `MCP_INTEGRATION_TOKEN` to a signed JWT containing the appropriate `realm_access.roles` and configure `OIDC_ISSUER_URL` and a `JWTVerifier`.

---

## Available tools

| Tool | Auth required | Description |
|------|---------------|-------------|
| `get_active_edition` | public | Current/next upcoming active festival edition |
| `list_editions` | public | Past and upcoming festival editions for historical discovery |
| `get_event_schedule` | public | Event schedule for an edition |
| `get_venue_plan_summary` | public | Rooms and table counts for a venue |
| `find_guest` | volunteer+ | Search guests by name or email |
| `get_guest_registration` | volunteer+ | Registration details for a specific booking |
| `get_table_seating` | volunteer+ | Who is seated at which table |
| `get_table_order_summary` | volunteer+ | All orders for a specific table |
| `get_guest_order_status` | volunteer+ | Order and delivery status for one registration |
| `get_champagne_delivery_summary` | volunteer+ | Champagne delivery stats across the edition |
| `get_undelivered_champagne_by_table` | volunteer+ | Tables with pending champagne deliveries |
| `get_check_in_summary` | volunteer+ | Check-in statistics for the edition |

### Role tiers

| Role | Access |
|------|--------|
| **admin** | Full operational detail; all fields including email, phone, club notes |
| **volunteer** | Event-day operational tools; name and contact info but not sensitive fields |
| **public** | No PII; edition, event, and venue overview only |

Roles are read from the `realm_access.roles` claim in the bearer JWT.

---

## Client configuration

### Claude Desktop

Add this to your `claude_desktop_config.json` (typically `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "champagne-festival": {
      "command": "uv",
      "args": [
        "--directory",
        "/absolute/path/to/champagnefestival/backend",
        "run",
        "python",
        "-m",
        "app.mcp_server"
      ],
      "env": {
        "DATABASE_URL": "postgresql+asyncpg://postgres:postgres@localhost:5432/champagne"
      }
    }
  }
}
```

Replace `/absolute/path/to/champagnefestival/backend` with the actual path on your machine.

### Codex CLI

Create or update your Codex MCP configuration (typically `~/.codex/config.toml`):

```toml
[[mcp_servers]]
name = "champagne-festival"
command = ["uv", "--directory", "/absolute/path/to/champagnefestival/backend", "run", "python", "-m", "app.mcp_server"]
env = { DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/champagne" }
```

---

## HTTP (SSE) transport with Keycloak auth

For production use or when running as a network-accessible service, set the following environment variables:

| Variable | Description |
|----------|-------------|
| `OIDC_ISSUER_URL` | Keycloak realm URL, e.g. `https://auth.example.com/realms/myrealm` |
| `MCP_BASE_URL` | Public URL of this MCP server, e.g. `https://mcp.champagnefestival.be` |
| `DATABASE_URL` | PostgreSQL connection string |

Then run with:

```bash
cd backend
uv run uvicorn app.mcp_http:app --host 0.0.0.0 --port 8001
```

The HTTP transport will use `KeycloakAuthProvider` when both `OIDC_ISSUER_URL` and `MCP_BASE_URL` are configured.

---

## Delivery state note

Champagne delivery is currently tracked per order **line** (a boolean `delivered` flag), not per individual bottle. The delivery tools report:

- `delivered_lines` — number of order lines fully marked as delivered
- `pending_lines` — number of order lines not yet delivered
- `ordered_quantity` / `delivered_quantity` / `pending_quantity` — total bottle counts based on line quantity (assumes all-or-nothing per line)

Partial delivery tracking (e.g., 4 of 6 bottles delivered on a single line) is planned in [issue #435](https://github.com/tjorim/champagnefestival/issues/435).

---

## Development

### Running the test suite

```bash
cd backend
# Start a PostgreSQL test database (if not already running)
docker compose up db -d

uv run pytest tests/test_mcp_server.py -v
```

The MCP server unit tests use mocked database sessions and do not require a running PostgreSQL instance.

### Adding new tools

1. Add a method to `ChampagneFestivalMcpBackend` in `backend/app/mcp_server.py`.
2. Register it with `mcp.tool(backend.your_new_method)` in `create_mcp_server()`.
3. Add unit tests in `backend/tests/test_mcp_server.py`.
