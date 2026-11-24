"""Unit tests for the FastMCP v4 MCP server backend.

Tests are organised as:
- Role resolution
- Server creation / tool registration
- Tool happy paths (with mocked DB session)
- Edge cases: empty active edition, missing table/guest
- PII filtering by role
- Representative order/delivery payloads

The DB is mocked using an in-memory SQLite-backed async engine so no running
PostgreSQL instance is required for these unit tests.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastmcp.exceptions import ToolError

from app.mcp import auth as mcp_auth_module
from app.mcp.admin import integration_clients as mcp_admin_integration_clients
from app.mcp.admin import registrations as mcp_admin_registrations
from app.mcp.admin import settings as mcp_admin_settings
from app.mcp.admin import venues as mcp_admin_venues
from app.mcp.capabilities import ROLE_ADMIN, ROLE_PUBLIC, ROLE_VOLUNTEER, tool_required_role
from app.mcp.server import (
    ChampagneFestivalMcpBackend,
    build_keycloak_auth,
    create_mcp_server,
)
from app.mcp.tools import base as mcp_base_module
from app.services.integration_clients_service import DEFAULT_RATE_LIMIT_PER_MINUTE
from tests.mcp_fakes import make_access_token

# ---------------------------------------------------------------------------
# Keycloak auth construction
# ---------------------------------------------------------------------------


def test_build_keycloak_auth_accepts_client_credentials_without_user_scopes(monkeypatch):
    from fastmcp.server.auth import MultiAuth

    monkeypatch.setattr(mcp_auth_module.settings, "oidc_issuer_url", "https://auth.example/realms/champagnefestival")
    monkeypatch.setattr(mcp_auth_module.settings, "mcp_base_url", "https://api.example/mcp")
    monkeypatch.setattr(mcp_auth_module.settings, "oidc_audience", "champagnefestival")

    with patch("fastmcp.server.auth.providers.keycloak.KeycloakAuthProvider") as provider:
        auth = build_keycloak_auth(session_factory=MagicMock())

    # build_keycloak_auth() now composes Keycloak with the database-backed
    # integration-client verifier via MultiAuth (see #807) — Keycloak client
    # credentials keep working unchanged, they're just no longer the only
    # accepted credential type.
    assert isinstance(auth, MultiAuth)
    assert auth.server is provider.return_value
    provider.assert_called_once_with(
        realm_url="https://auth.example/realms/champagnefestival",
        base_url="https://api.example/mcp",
        audience="champagnefestival",
        required_scopes=[],
    )


def test_build_keycloak_auth_includes_integration_key_verifier(monkeypatch):
    from app.mcp.integration_auth import IntegrationKeyTokenVerifier

    monkeypatch.setattr(mcp_auth_module.settings, "oidc_issuer_url", "https://auth.example/realms/champagnefestival")
    monkeypatch.setattr(mcp_auth_module.settings, "mcp_base_url", "https://api.example/mcp")

    with patch("fastmcp.server.auth.providers.keycloak.KeycloakAuthProvider"):
        auth = build_keycloak_auth(session_factory=MagicMock())

    assert len(auth.verifiers) == 1
    assert isinstance(auth.verifiers[0], IntegrationKeyTokenVerifier)


def test_build_keycloak_auth_rejects_http_mcp_without_oidc(monkeypatch):
    monkeypatch.setattr(mcp_auth_module.settings, "oidc_issuer_url", "")
    monkeypatch.setattr(mcp_auth_module.settings, "mcp_base_url", "https://api.example/mcp")

    with pytest.raises(RuntimeError, match="OIDC_ISSUER_URL is required"):
        build_keycloak_auth()


def test_build_keycloak_auth_propagates_provider_failure(monkeypatch):
    monkeypatch.setattr(mcp_auth_module.settings, "oidc_issuer_url", "https://auth.example/realms/champagnefestival")
    monkeypatch.setattr(mcp_auth_module.settings, "mcp_base_url", "https://api.example/mcp")

    with (
        patch(
            "fastmcp.server.auth.providers.keycloak.KeycloakAuthProvider",
            side_effect=RuntimeError("provider setup failed"),
        ),
        pytest.raises(RuntimeError, match="provider setup failed"),
    ):
        build_keycloak_auth()


def test_build_keycloak_auth_is_unused_without_http_mcp(monkeypatch):
    monkeypatch.setattr(mcp_auth_module.settings, "oidc_issuer_url", "")
    monkeypatch.setattr(mcp_auth_module.settings, "mcp_base_url", "")

    assert build_keycloak_auth() is None


# ---------------------------------------------------------------------------
# Role resolution
# ---------------------------------------------------------------------------


class TestResolveRole:
    def test_no_token_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_admin_roles_returns_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["admin"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_ADMIN

    def test_volunteer_role_returns_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_VOLUNTEER

    def test_admin_takes_precedence_over_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["volunteer", "admin"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_ADMIN

    def test_unknown_role_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["visitor"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_missing_realm_access_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={})
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_non_dict_realm_access_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"realm_access": "not-a-dict"})
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_roles_not_a_list_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"realm_access": {"roles": "admin"}})
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_require_volunteer_raises_for_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            backend._require_volunteer()

    def test_require_volunteer_passes_for_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            role = backend._require_volunteer()
        assert role == ROLE_VOLUNTEER

    def test_require_volunteer_passes_for_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["admin"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            role = backend._require_volunteer()
        assert role == ROLE_ADMIN

    def test_require_admin_raises_for_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            backend._require_admin()

    def test_require_admin_raises_for_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token), pytest.raises(PermissionError):
            backend._require_admin()

    def test_require_admin_passes_for_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["admin"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            role = backend._require_admin()
        assert role == ROLE_ADMIN

    def test_actor_returns_anonymous_without_token(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None):
            assert backend._actor() == "anonymous"

    def test_actor_returns_sub_claim(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"sub": "admin-sub-123", "realm_access": {"roles": ["admin"]}})
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._actor() == "admin-sub-123"

    def test_actor_returns_anonymous_without_sub_claim(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"realm_access": {"roles": ["admin"]}})
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._actor() == "anonymous"

    def test_auth_source_none_without_token(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None):
            assert backend._auth_source() == "none"

    def test_auth_source_keycloak_for_ordinary_jwt(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"sub": "user-1", "realm_access": {"roles": ["admin"]}})
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._auth_source() == "keycloak"

    def test_auth_source_integration_when_claim_present(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(
            claims={
                "sub": "integration:ic-1",
                "realm_access": {"roles": ["volunteer"]},
                "auth_source": "integration",
            }
        )
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            assert backend._auth_source() == "integration"


# ---------------------------------------------------------------------------
# whoami — identity/capability discovery (#807)
# ---------------------------------------------------------------------------


class TestWhoami:
    @pytest.mark.anyio
    async def test_whoami_unauthenticated(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None):
            result = await backend.whoami()
        assert result == {"auth_source": "none", "subject": None, "role": ROLE_PUBLIC}

    @pytest.mark.anyio
    async def test_whoami_keycloak_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"sub": "user-1", "realm_access": {"roles": ["admin"]}})
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.whoami()
        assert result == {"auth_source": "keycloak", "subject": "user-1", "role": ROLE_ADMIN}

    @pytest.mark.anyio
    async def test_whoami_integration_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(
            claims={
                "sub": "integration:ic-1",
                "realm_access": {"roles": ["volunteer"]},
                "auth_source": "integration",
            }
        )
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.whoami()
        assert result == {"auth_source": "integration", "subject": "integration:ic-1", "role": ROLE_VOLUNTEER}

    @pytest.mark.anyio
    async def test_whoami_never_exposes_token_material(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(
            claims={"sub": "user-1", "realm_access": {"roles": ["admin"]}},
            token="super-secret-raw-jwt",  # noqa: S106
        )
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.whoami()
        assert "super-secret-raw-jwt" not in str(result)
        assert "token" not in result


# ---------------------------------------------------------------------------
# Admin write tool wiring (role gate + delegation to app.mcp.admin.*)
# ---------------------------------------------------------------------------


class TestAdminToolWiring:
    """Spot-checks that admin tools enforce _require_admin and delegate with
    the right (session_factory, actor, ...) shape. Business logic itself is
    covered by each app.mcp.admin.* module's own test file."""

    @pytest.mark.anyio
    async def test_create_venue_requires_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.create_venue(name="Test Venue")

    @pytest.mark.anyio
    async def test_create_venue_delegates_with_actor(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"sub": "admin-1", "realm_access": {"roles": ["admin"]}})
        with (
            patch.object(mcp_base_module, "get_access_token", return_value=token),
            patch.object(mcp_admin_venues, "create_venue", new=AsyncMock(return_value={"id": "venue-1"})) as mocked,
        ):
            result = await backend.create_venue(name="Test Venue", city="Bredene")
        assert result == {"id": "venue-1"}
        mocked.assert_awaited_once_with(
            backend.session_factory,
            "admin-1",
            name="Test Venue",
            address="",
            city="Bredene",
            postal_code="",
            country="",
            lat=None,
            lng=None,
            active=True,
        )

    @pytest.mark.anyio
    async def test_list_registrations_requires_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token), pytest.raises(PermissionError):
            await backend.list_registrations()

    @pytest.mark.anyio
    async def test_list_registrations_delegates_with_role_and_filters(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"sub": "admin-1", "realm_access": {"roles": ["admin"]}})
        with (
            patch.object(mcp_base_module, "get_access_token", return_value=token),
            patch.object(
                mcp_admin_registrations,
                "list_registrations",
                new=AsyncMock(return_value={"registrations": [], "count": 0, "next_offset": None}),
            ) as mocked,
        ):
            result = await backend.list_registrations(edition_id="edition-1", status="confirmed", limit=10)
        assert result == {"registrations": [], "count": 0, "next_offset": None}
        mocked.assert_awaited_once_with(
            backend.session_factory,
            "admin",
            edition_id="edition-1",
            event_id=None,
            status="confirmed",
            payment_status=None,
            checked_in=None,
            q=None,
            limit=10,
            offset=0,
        )

    @pytest.mark.anyio
    async def test_delete_registration_requires_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token), pytest.raises(PermissionError):
            await backend.delete_registration("reg-1")

    @pytest.mark.anyio
    async def test_delete_registration_delegates_with_actor(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"sub": "admin-1", "realm_access": {"roles": ["admin"]}})
        with (
            patch.object(mcp_base_module, "get_access_token", return_value=token),
            patch.object(
                mcp_admin_registrations,
                "delete_registration",
                new=AsyncMock(return_value={"deleted": True, "id": "reg-1"}),
            ) as mocked,
        ):
            result = await backend.delete_registration("reg-1")
        assert result == {"deleted": True, "id": "reg-1"}
        mocked.assert_awaited_once_with(backend.session_factory, "admin-1", "reg-1")

    @pytest.mark.anyio
    async def test_get_settings_does_not_require_admin(self):
        """Mirrors REST: GET /api/settings has no auth dependency."""
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with (
            patch.object(mcp_base_module, "get_access_token", return_value=None),
            patch.object(
                mcp_admin_settings,
                "get_settings",
                new=AsyncMock(return_value={"maintenance_mode": False}),
            ) as mocked,
        ):
            result = await backend.get_settings()
        assert result == {"maintenance_mode": False}
        mocked.assert_awaited_once_with(backend.session_factory)

    @pytest.mark.anyio
    async def test_set_maintenance_mode_requires_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.set_maintenance_mode(maintenance_mode=True)

    @pytest.mark.anyio
    async def test_set_maintenance_mode_delegates_with_actor(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"sub": "admin-1", "realm_access": {"roles": ["admin"]}})
        with (
            patch.object(mcp_base_module, "get_access_token", return_value=token),
            patch.object(
                mcp_admin_settings,
                "set_maintenance_mode",
                new=AsyncMock(return_value={"maintenance_mode": True}),
            ) as mocked,
        ):
            result = await backend.set_maintenance_mode(maintenance_mode=True)
        assert result == {"maintenance_mode": True}
        mocked.assert_awaited_once_with(backend.session_factory, "admin-1", maintenance_mode=True)

    @pytest.mark.anyio
    async def test_create_integration_client_requires_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token), pytest.raises(PermissionError):
            await backend.create_integration_client(name="X", allowed_role="volunteer")

    @pytest.mark.anyio
    async def test_create_integration_client_delegates_with_actor(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"sub": "admin-1", "realm_access": {"roles": ["admin"]}})
        with (
            patch.object(mcp_base_module, "get_access_token", return_value=token),
            patch.object(
                mcp_admin_integration_clients,
                "create_integration_client",
                new=AsyncMock(return_value={"id": "ic-1", "key": "cfic_x"}),
            ) as mocked,
        ):
            result = await backend.create_integration_client(name="Home Assistant", allowed_role="volunteer")
        assert result == {"id": "ic-1", "key": "cfic_x"}
        mocked.assert_awaited_once_with(
            backend.session_factory,
            "admin-1",
            name="Home Assistant",
            allowed_role="volunteer",
            rate_limit_per_minute=DEFAULT_RATE_LIMIT_PER_MINUTE,
        )

    @pytest.mark.anyio
    async def test_revoke_integration_client_requires_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.revoke_integration_client("ic-1")


# ---------------------------------------------------------------------------
# Server creation / tool registration
# ---------------------------------------------------------------------------


class TestCreateMcpServer:
    def test_create_mcp_server_returns_fastmcp(self):
        from fastmcp import FastMCP

        factory = MagicMock()
        mcp = create_mcp_server(session_factory=factory)
        assert isinstance(mcp, FastMCP)

    def test_create_mcp_server_without_factory_uses_default(self):
        from fastmcp import FastMCP

        mcp = create_mcp_server()
        assert isinstance(mcp, FastMCP)

    @pytest.mark.anyio
    async def test_create_mcp_server_registers_expected_tools(self):
        factory = MagicMock()
        mcp = create_mcp_server(session_factory=factory)
        # With BM25SearchTransform, the server-level list_tools() returns only
        # always_visible tools that pass auth plus the synthetic search/call tools.
        # local_provider.list_tools() returns the full catalog without transforms.
        tools = await mcp.list_tools()
        tool_names = {tool.name for tool in tools}

        # With BM25SearchTransform, tools are hidden behind
        # search_tools and call_tool. Only always_visible tools that pass the
        # current auth context are directly listed.
        expected = {
            "whoami",
            "get_active_edition",
            "search_tools",
            "call_tool",
        }
        assert expected == tool_names

        registered = {tool.name for tool in await mcp.local_provider.list_tools()}
        assert "find_guest" in registered
        assert "create_venue" in registered
        assert "guest_search_app" not in registered

    @pytest.mark.anyio
    async def test_search_tools_finds_public_schedule_without_role_claims(self):
        mcp = create_mcp_server(session_factory=MagicMock())
        result = await mcp.call_tool("search_tools", {"query": "festival event schedule"})

        assert result.structured_content is not None
        names = [item["name"] for item in result.structured_content["result"]]
        assert "get_event_schedule" in names
        assert "find_guest" not in names

    @pytest.mark.anyio
    async def test_search_tools_results_use_access_shape(self):
        mcp = create_mcp_server(session_factory=MagicMock())
        result = await mcp.call_tool("search_tools", {"query": "festival event schedule"})

        assert result.structured_content is not None
        items = result.structured_content["result"]
        assert items
        for item in items:
            assert "required_role" not in item
            assert item["access"] == {"role": tool_required_role(item["name"])}
            # Same fields as the capability manifest (contract v1).
            assert item["requires_confirmation"] is False
            assert item["effect"] in {"read", "write"}

    @pytest.mark.anyio
    async def test_call_tool_proxy_runs_tool_visible_to_caller(self):
        # Positive control for the refusals below: the proxy itself works.
        mcp = create_mcp_server(session_factory=MagicMock())
        result = await mcp.call_tool("call_tool", {"name": "whoami", "arguments": {}})

        assert result.structured_content is not None
        assert result.structured_content["role"] == "public"

    @pytest.mark.anyio
    @pytest.mark.parametrize(
        "hidden_name",
        [
            "find_guest",  # volunteer-only
            "create_venue",  # admin-only
            "does_not_exist",
            "search_tools",  # synthetic tools are not proxyable
            "call_tool",
        ],
    )
    async def test_call_tool_proxy_refuses_tools_outside_caller_catalog(self, hidden_name):
        # The proxy only reaches tools the caller could discover via search_tools,
        # so an anonymous caller cannot use it to run volunteer/admin tools.
        mcp = create_mcp_server(session_factory=MagicMock())

        with pytest.raises(ToolError):
            await mcp.call_tool("call_tool", {"name": hidden_name, "arguments": {}})

    @pytest.mark.anyio
    async def test_search_tools_finds_seating_and_floor_plan_tools_by_plain_language(self):
        # Regression for docstring keywords: BM25 only matches words present in
        # the tool text, so these phrasings must stay discoverable. Ranked over
        # the full catalog because the anonymous catalog hides non-public tools.
        from fastmcp.server.transforms.search import BM25SearchTransform

        mcp = create_mcp_server(session_factory=MagicMock())
        tools = [t for t in await mcp.local_provider.list_tools() if t.name != "whoami"]
        transform = BM25SearchTransform(max_results=10)

        seating = await transform._search(tools, "who is seated at table 12")
        assert "get_table_seating" in [t.name for t in seating]

        moving = await transform._search(tools, "move a table on the floor plan")
        assert "update_table" in [t.name for t in moving]

    @pytest.mark.anyio
    async def test_search_tools_supports_unicode_tokens(self):
        from fastmcp import FastMCP
        from fastmcp.server.transforms.search import BM25SearchTransform

        mcp = FastMCP(
            name="unicode-search-test",
            transforms=[BM25SearchTransform(search_tool_name="search_tools")],
        )

        @mcp.tool
        def tasting_programme() -> str:
            """Return the dégustation programme."""
            return ""

        result = await mcp.call_tool("search_tools", {"query": "dégustation"})

        assert result.structured_content is not None
        names = [item["name"] for item in result.structured_content["result"]]
        assert "tasting_programme" in names


# ---------------------------------------------------------------------------
# MCPToolError / mask_error_details — the mechanism admin MCP tools rely on
# to keep unsanitized exception details from ever reaching a client.
#
# A full round trip through this project's ``create_mcp_server()`` would need
# a real FastMCP-native auth context (its per-tool ``require_roles`` check
# reads the access token via FastMCP's own request-context machinery, not the
# ``mcp_base_module.get_access_token`` this file already patches for backend-level
# tests) — not reproducible in-process without a live Keycloak token. These
# tests instead exercise the mechanism directly against a minimal FastMCP
# server with the same ``mask_error_details=True`` setting, which is exactly
# where the "does our error class pass through unmodified, does everything
# else get masked" behaviour actually lives.
# ---------------------------------------------------------------------------


class TestMCPToolErrorMasking:
    @pytest.mark.anyio
    async def test_mcp_tool_error_message_passes_through_unmodified(self):
        from fastmcp import FastMCP

        from app.mcp.utils import MCPToolError

        mcp = FastMCP(name="test", mask_error_details=True)

        @mcp.tool
        def delete_something() -> str:
            raise MCPToolError("Cannot delete event: 1 registration(s) are still linked to it.")

        with pytest.raises(ToolError) as exc_info:
            await mcp.call_tool("delete_something", {})

        message = str(exc_info.value)
        assert message == "Cannot delete event: 1 registration(s) are still linked to it."
        # Would appear if MCPToolError fell into the generic `except Exception`
        # branch (the one every plain `ValueError` hits) instead of FastMCP's
        # `except FastMCPError` re-raise.
        assert "Error calling tool" not in message

    @pytest.mark.anyio
    async def test_unwrapped_exception_is_masked_not_leaked(self):
        """A bug nobody wrapped in ``MCPToolError`` must not leak ``str(exc)``.

        This is the failure mode the original ``delete_event`` bug actually
        was: an uncaught, unanticipated exception (there, a raw SQLAlchemy
        ``IntegrityError`` with SQL and row contents). Without
        ``mask_error_details=True``, FastMCP's default behaviour embeds the
        full exception text in the tool result; this proves the server-wide
        safety net now catches that case generally, not just the one call
        site that got a manual pre-check.
        """
        from fastmcp import FastMCP

        mcp = FastMCP(name="test", mask_error_details=True)

        @mcp.tool
        def delete_something() -> str:
            raise RuntimeError("duplicate key value violates unique constraint, token='super-secret-token'")

        with pytest.raises(ToolError) as exc_info:
            await mcp.call_tool("delete_something", {})

        message = str(exc_info.value)
        assert "super-secret-token" not in message
        assert "duplicate key value" not in message
