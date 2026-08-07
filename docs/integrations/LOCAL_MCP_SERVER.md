# Local MCP Server — Champagnefestival

The Champagnefestival backend ships a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server built with [FastMCP v3](https://gofastmcp.com/).

It exposes operational tools that allow desktop agents (Claude Desktop, Codex CLI, etc.) to answer event-day questions:

- Who sits where?
- What did this guest or table order?
- Which champagne orders are already delivered?
- Which tables still have undelivered champagne?
- How many guests are checked in?

Admins additionally get full write/management parity with the admin REST API — editions,
events, venues, rooms, table types, tables, layouts, areas, FAQ, settings, exhibitors,
people, members, volunteers, registrations, and read access to the audit trail. See
[Admin write/management tools](#admin-writemanagement-tools) below.

---

## Prerequisites

- Python 3.13+
- [`uv`](https://docs.astral.sh/uv/) (recommended) or pip
- A running PostgreSQL database with the Champagnefestival schema
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
| `resolve_table_reference` | volunteer+ | Resolve a visible table number, name, or label |
| `get_table_order_summary` | volunteer+ | All orders for a table ID or visible reference |
| `get_guest_order_status` | volunteer+ | Order and delivery status for one registration |
| `get_champagne_delivery_summary` | volunteer+ | Champagne delivery stats across the edition |
| `get_undelivered_champagne_by_table` | volunteer+ | Tables with pending champagne deliveries |
| `get_check_in_summary` | volunteer+ | Check-in statistics for the edition |

### Admin write/management tools

Full write parity with the admin REST API, implemented in `backend/app/mcp/admin/` — one
module per resource, each mirroring its REST router's validation, cascade guards, and
audit trail. Every mutation writes an `AuditEntry` via the same `write_audit_entry` path
the REST admin routes use (readable back via `list_audit_entries`), so the audit log is
complete regardless of which surface made the change. All are `admin`-only except
`get_settings`, which is public (mirroring `GET /api/settings`).

| Resource | Tools |
|----------|-------|
| Editions | `create_edition`, `get_edition`, `update_edition`, `delete_edition` |
| Events | `create_event`, `get_event`, `update_event`, `delete_event` |
| Venues | `create_venue`, `list_venues`, `get_venue`, `update_venue`, `delete_venue` |
| Rooms | `create_room`, `list_rooms`, `get_room`, `update_room`, `delete_room` |
| Table types | `create_table_type`, `list_table_types`, `get_table_type`, `update_table_type`, `delete_table_type` |
| Tables | `create_table`, `list_tables`, `get_table`, `update_table`, `delete_table` |
| Layouts | `create_layout`, `copy_layout`, `list_layouts`, `get_layout`, `delete_layout` |
| Areas | `create_area`, `list_areas`, `get_area`, `update_area`, `delete_area` |
| FAQ | `create_faq_item`, `list_faq_items`, `update_faq_item`, `delete_faq_item` |
| Settings | `get_settings` (public), `set_maintenance_mode` |
| Exhibitors | `create_exhibitor`, `get_exhibitor`, `list_exhibitors`, `update_exhibitor`, `delete_exhibitor` |
| People | `create_person`, `get_person`, `update_person`, `delete_person`, `merge_people` |
| Members | `create_member`, `get_member`, `list_members`, `update_member`, `delete_member` |
| Volunteers | `create_volunteer`, `get_volunteer`, `list_volunteers`, `update_volunteer`, `delete_volunteer` |
| Registrations | `create_registration`, `update_registration`, `delete_registration` |
| Audit trail | `list_audit_entries`, `list_audit_resource_types` |

Partial updates follow one convention throughout: an omitted keyword argument (`None`)
leaves that field unchanged. Nullable fields with no natural "clear" value (an id, not
free text) expose a sibling `clear_<field>: bool = False` parameter instead — e.g.
`update_registration(..., clear_table=True)` unassigns a table. See the docstrings on
`backend/app/mcp/admin/__init__.py` and each tool for specifics.

### Role tiers

| Role | Access |
|------|--------|
| **admin** | Full operational detail, all read tools, and all write/management tools |
| **volunteer** | Event-day operational tools; name and contact info but not sensitive fields |
| **public** | No PII; edition, event, and venue overview only, plus `get_settings` |

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

`tests/test_mcp_server.py` (role resolution, tool registration, and the read-only tools)
uses mocked database sessions and does not require a running PostgreSQL instance.

`tests/test_mcp_admin_*.py` (one file per `app/mcp/admin/` module) exercise the admin
write tools against a real database, same as the REST router tests — set
`TEST_DATABASE_URL` (see the backend README) and run:

```bash
uv run pytest tests/test_mcp_admin_venues.py tests/test_mcp_admin_registrations.py -v
```

### Adding new tools

**Read-only tools:**
1. Add a method to `ChampagneFestivalMcpBackend` in `backend/app/mcp_server.py`.
2. Register it with `mcp.tool(backend.your_new_method)` in `create_mcp_server()`.
3. Add unit tests in `backend/tests/test_mcp_server.py`.

**Admin write tools:**
1. Add the implementation to the relevant module under `backend/app/mcp/admin/` (or a new
   module, for a resource not yet covered), reusing the REST router's Pydantic schemas
   (via `validate_with_schema`) and private helper functions rather than re-deriving their
   validation/business logic — see `backend/app/mcp/admin/__init__.py` for the module-wide
   conventions and `venues.py` for a worked example.
2. Add a thin `ChampagneFestivalMcpBackend` method in `backend/app/mcp_server.py` that
   calls `self._require_admin()` (or leaves it out, for a REST endpoint with no auth
   dependency, like `get_settings`) and delegates to it with `self._actor()`.
3. Register it with `mcp.tool(backend.your_new_method)` in `create_mcp_server()`.
4. Add tests in `backend/tests/test_mcp_admin_<module>.py` against a real database, and a
   role-gating/delegation spot-check in `backend/tests/test_mcp_server.py`'s
   `TestAdminToolWiring`.
