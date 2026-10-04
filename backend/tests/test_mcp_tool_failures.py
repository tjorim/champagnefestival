"""Tests for ToolFailureMiddleware and the search_tools/call_tool proxy surface.

The proxy runs every hidden tool, so what an agent sees when it goes wrong —
and that nothing leaks or diverges from a direct call — is part of the
contract, not an implementation detail.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.transforms.search import BM25SearchTransform
from sqlalchemy import select

import app.mcp_server as mcp_module
from app.mcp.middleware import CorrelatedToolError, ToolFailureMiddleware
from app.mcp.utils import MCPToolError
from app.mcp_server import ALWAYS_VISIBLE_TOOLS, ChampagneFestivalMcpBackend, create_mcp_server
from app.models import AuditEntry
from tests.helpers import mcp_session_factory

REQUEST_ID = re.compile(r"request id ([0-9a-f]{12})")


def _request_id(message: str) -> str:
    match = REQUEST_ID.search(message)
    assert match, f"no request id in {message!r}"
    return match.group(1)


def _structured(result) -> dict:
    assert result.structured_content is not None
    return result.structured_content


def _server_with_proxy(**tools) -> FastMCP:
    """A minimal server wired like ``create_mcp_server`` (middleware, masking, proxy)."""
    mcp = FastMCP(
        name="failure-test",
        mask_error_details=True,
        middleware=[ToolFailureMiddleware()],
        transforms=[BM25SearchTransform(always_visible=[])],
    )
    for fn in tools.values():
        mcp.tool(fn)
    return mcp


async def _failure(mcp: FastMCP, tool: str, arguments: dict) -> ToolError:
    with pytest.raises(ToolError) as exc_info:
        await mcp.call_tool(tool, arguments)
    return exc_info.value


class TestUnknownTool:
    @pytest.mark.parametrize("via_proxy", [False, True])
    async def test_unknown_tool_says_to_use_search_tools(self, via_proxy):
        mcp = create_mcp_server(session_factory=MagicMock())
        args = {"name": "does_not_exist", "arguments": {}}

        error = await _failure(mcp, "call_tool" if via_proxy else "does_not_exist", args if via_proxy else {})

        assert isinstance(error, CorrelatedToolError)
        message = str(error)
        assert "Unknown tool 'does_not_exist'" in message
        assert "search_tools" in message
        assert REQUEST_ID.search(message)

    async def test_hidden_tool_is_indistinguishable_from_unknown(self):
        # An anonymous caller must not learn that find_guest exists but is restricted.
        mcp = create_mcp_server(session_factory=MagicMock())

        hidden = str(await _failure(mcp, "call_tool", {"name": "find_guest", "arguments": {}}))
        unknown = str(await _failure(mcp, "call_tool", {"name": "no_such_tool", "arguments": {}}))

        assert REQUEST_ID.sub("", hidden).replace("find_guest", "X") == REQUEST_ID.sub("", unknown).replace(
            "no_such_tool", "X"
        )

    @pytest.mark.parametrize("name", ["search_tools", "call_tool"])
    async def test_synthetic_tools_cannot_be_proxied(self, name):
        mcp = create_mcp_server(session_factory=MagicMock())

        message = str(await _failure(mcp, "call_tool", {"name": name, "arguments": {}}))

        assert f"{name!r} cannot be run through call_tool" in message
        assert "Error calling tool" not in message


class TestInvalidArguments:
    async def test_names_failing_field_and_not_the_value(self):
        def book_table(guest_count: int) -> str:
            return "ok"

        mcp = _server_with_proxy(book_table=book_table)
        secret = "marie.dupont@example.com"

        error = await _failure(mcp, "call_tool", {"name": "book_table", "arguments": {"guest_count": secret}})

        message = str(error)
        assert "Invalid arguments for 'book_table'" in message
        assert "guest_count" in message
        assert secret not in message
        assert REQUEST_ID.search(message)

    async def test_log_has_field_paths_and_error_types_never_values(self, caplog):
        def book_table(guest_count: int, notes: str) -> str:
            return "ok"

        mcp = _server_with_proxy(book_table=book_table)
        secret = "marie.dupont@example.com"

        with caplog.at_level(logging.DEBUG):
            error = await _failure(mcp, "book_table", {"guest_count": secret})

        request_id = _request_id(str(error))
        record = next(r for r in caplog.records if request_id in r.getMessage())
        text = record.getMessage()
        assert "guest_count" in text
        assert "notes" in text  # the missing field
        assert secret not in caplog.text

    async def test_missing_required_argument_via_proxy(self):
        mcp = create_mcp_server(session_factory=MagicMock())

        # whoami takes nothing, but get_event_schedule's optional filters reject wrong types.
        message = str(await _failure(mcp, "call_tool", {"name": "get_event_schedule", "arguments": {"edition_id": 5}}))

        assert "Invalid arguments for 'get_event_schedule'" in message
        assert "edition_id" in message

    async def test_malformed_proxy_call_is_reported_against_the_proxy(self):
        mcp = create_mcp_server(session_factory=MagicMock())

        message = str(await _failure(mcp, "call_tool", {"name": 5}))

        assert "Invalid arguments for 'call_tool'" in message
        assert "name" in message


class TestUnexpectedFailure:
    async def test_error_carries_type_and_request_id_but_not_details(self, caplog):
        def explode() -> str:
            raise RuntimeError("duplicate key value violates unique constraint, token='super-secret-token'")

        mcp = _server_with_proxy(explode=explode)

        with caplog.at_level(logging.ERROR):
            error = await _failure(mcp, "call_tool", {"name": "explode", "arguments": {}})

        message = str(error)
        assert "'explode' failed unexpectedly (RuntimeError)" in message
        assert "super-secret-token" not in message
        assert "duplicate key" not in message
        request_id = _request_id(message)
        # The same id is in the log, next to the traceback an operator needs.
        record = next(r for r in caplog.records if request_id in r.getMessage())
        assert record.exc_info is not None
        assert isinstance(record.exc_info[1], RuntimeError)

    async def test_distinct_failures_get_distinct_request_ids(self):
        def explode() -> str:
            raise RuntimeError("boom")

        mcp = _server_with_proxy(explode=explode)

        ids = {
            _request_id(str(await _failure(mcp, "explode", {}))),
            _request_id(str(await _failure(mcp, "explode", {}))),
        }

        assert len(ids) == 2

    async def test_domain_errors_pass_through_unchanged(self):
        def delete_something() -> str:
            raise MCPToolError("Cannot delete event: 1 registration(s) are still linked to it.")

        mcp = _server_with_proxy(delete_something=delete_something)

        error = await _failure(mcp, "call_tool", {"name": "delete_something", "arguments": {}})

        assert str(error) == "Cannot delete event: 1 registration(s) are still linked to it."
        assert not isinstance(error, CorrelatedToolError)

    async def test_deliberate_fastmcp_notices_pass_through(self, monkeypatch):
        # FastMCP words timeouts/rate limits for the agent even when masking; those are not crashes.
        monkeypatch.setattr("fastmcp.server.server.is_timeout_error", lambda exc: isinstance(exc, TimeoutError))

        def slow() -> str:
            raise TimeoutError("upstream took too long")

        mcp = _server_with_proxy(slow=slow)

        error = await _failure(mcp, "slow", {})

        assert str(error) == "Upstream request timed out, please retry"

    async def test_each_failure_is_translated_exactly_once_through_the_proxy(self):
        # The proxy dispatches the real tool through the middleware a second time;
        # a re-translation would bury the real cause under a second request id.
        def explode() -> str:
            raise RuntimeError("boom")

        mcp = _server_with_proxy(explode=explode)

        message = str(await _failure(mcp, "call_tool", {"name": "explode", "arguments": {}}))

        assert len(REQUEST_ID.findall(message)) == 1
        assert "'explode' failed unexpectedly" in message


class TestProxyBehaviour:
    async def test_parallel_proxy_calls_return_their_own_results(self):
        def echo(value: str) -> str:
            return value

        mcp = _server_with_proxy(echo=echo)

        results = await asyncio.gather(
            *(mcp.call_tool("call_tool", {"name": "echo", "arguments": {"value": f"v{i}"}}) for i in range(10))
        )

        assert [_structured(r)["result"] for r in results] == [f"v{i}" for i in range(10)]

    async def test_parallel_failures_do_not_cross_streams(self):
        def explode(label: str) -> str:
            raise RuntimeError(label)

        mcp = _server_with_proxy(explode=explode)

        outcomes = await asyncio.gather(
            *(_failure(mcp, "call_tool", {"name": "explode", "arguments": {"label": f"l{i}"}}) for i in range(5))
        )

        ids = [_request_id(str(e)) for e in outcomes]
        assert len(set(ids)) == 5

    async def test_search_tools_parallel_with_calls(self):
        mcp = create_mcp_server(session_factory=MagicMock())

        search, call = await asyncio.gather(
            mcp.call_tool("search_tools", {"query": "festival event schedule"}),
            mcp.call_tool("call_tool", {"name": "whoami", "arguments": {}}),
        )

        assert any(item["name"] == "get_event_schedule" for item in _structured(search)["result"])
        assert _structured(call)["role"] == "public"

    async def test_audited_write_through_proxy_matches_direct_call(self, db_session):
        """A write via call_tool must leave the same audit trail as calling the tool directly."""
        backend = ChampagneFestivalMcpBackend(mcp_session_factory(db_session))
        mcp = FastMCP(
            name="audit-parity",
            mask_error_details=True,
            middleware=[ToolFailureMiddleware()],
            transforms=[BM25SearchTransform(always_visible=[])],
        )
        mcp.tool(backend.create_venue)
        admin = SimpleNamespace(claims={"sub": "admin-1", "realm_access": {"roles": ["admin"]}})

        with patch.object(mcp_module, "get_access_token", return_value=admin):
            await mcp.call_tool("create_venue", {"name": "Direct Venue"})
            await mcp.call_tool("call_tool", {"name": "create_venue", "arguments": {"name": "Proxied Venue"}})

        entries = list(
            (await db_session.execute(select(AuditEntry).where(AuditEntry.action == "venue_created"))).scalars()
        )
        assert len(entries) == 2

        def shape(entry: AuditEntry) -> tuple:
            return (entry.actor, entry.auth_source, entry.subject, entry.action, entry.resource_type)

        assert shape(entries[0]) == shape(entries[1])
        assert len({e.resource_id for e in entries}) == 2  # two venues, not one row written twice


class TestSearchCatalog:
    async def test_entry_tools_are_listed_without_searching(self):
        mcp = create_mcp_server(session_factory=MagicMock())

        listed = {tool.name for tool in await mcp.list_tools()}

        assert listed == {*ALWAYS_VISIBLE_TOOLS, "search_tools", "call_tool"}
        assert "get_active_edition" in listed

    async def test_every_tool_is_found_by_its_own_name(self):
        # Hidden tools are only reachable through search; a tool whose name does not
        # retrieve it is effectively undiscoverable. Ranked over the full catalog
        # (an anonymous caller's catalog hides non-public tools).
        mcp = create_mcp_server(session_factory=MagicMock())
        tools = [t for t in await mcp.local_provider.list_tools() if t.name not in ALWAYS_VISIBLE_TOOLS]
        transform = BM25SearchTransform(max_results=10)

        missing = []
        for tool in tools:
            found = await transform._search(tools, tool.name.replace("_", " "))
            if tool.name not in [t.name for t in found]:
                missing.append(tool.name)

        assert not missing, f"not retrievable by their own name: {missing}"

    async def test_search_results_stay_small_enough_to_return_ten(self):
        # max_results is 10 because the schemas are small; revisit it (Travel uses 5)
        # if a typical ten-result page grows past a few thousand tokens.
        mcp = create_mcp_server(session_factory=MagicMock())
        tools = [t for t in await mcp.local_provider.list_tools() if t.name not in ALWAYS_VISIBLE_TOOLS]
        transform = BM25SearchTransform(max_results=10)

        for query in ("move a table on the floor plan", "who is seated at table 12", "check in guest"):
            page = mcp_module._search_serializer(await transform._search(tools, query))
            assert len(json.dumps(page)) < 16_000, query
