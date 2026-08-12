"""Regression tests for the JSON schemas MCP clients see before calling a tool.

Guards against the failure modes reported in #835: enum-shaped fields (like
``height_type``/``shape``/``edition_type``) advertised as plain unconstrained
strings, physical dimensions with silent defaults that "look" like measured
values, and duplicate ``string``-typed variants in a date/datetime param's
``anyOf`` (from a redundant ``dt_date | str`` style annotation).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.mcp_server import create_mcp_server


@pytest.fixture
async def tool_schemas() -> dict[str, dict[str, Any]]:
    mcp = create_mcp_server()
    tools = await mcp.local_provider.list_tools()
    return {tool.name: tool.parameters for tool in tools}


def _optional_variants(schema: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the non-null members of an optional field's ``anyOf``."""
    return [v for v in schema.get("anyOf", [schema]) if v.get("type") != "null"]


class TestTableTypeEnums:
    async def test_create_exposes_shape_and_height_type_enums(self, tool_schemas):
        props = tool_schemas["create_table_type"]["properties"]
        assert props["shape"]["enum"] == ["rectangle", "round"]
        assert props["height_type"]["enum"] == ["low", "high"]

    async def test_update_exposes_shape_and_height_type_enums(self, tool_schemas):
        props = tool_schemas["update_table_type"]["properties"]
        assert _optional_variants(props["shape"])[0]["enum"] == ["rectangle", "round"]
        assert _optional_variants(props["height_type"])[0]["enum"] == ["low", "high"]

    async def test_create_rejects_arbitrary_string_via_schema(self, tool_schemas):
        """Guards against #835's 'seated'/'standing' failing only at runtime:
        the enum list itself is the client-visible contract now."""
        props = tool_schemas["create_table_type"]["properties"]
        assert "seated" not in props["height_type"]["enum"]
        assert "standing" not in props["height_type"]["enum"]


class TestEditionTypeEnum:
    async def test_create_edition_exposes_edition_type_enum(self, tool_schemas):
        props = tool_schemas["create_edition"]["properties"]
        assert props["edition_type"]["enum"] == ["festival", "bourse", "capsule_exchange"]

    async def test_update_edition_exposes_edition_type_enum(self, tool_schemas):
        props = tool_schemas["update_edition"]["properties"]
        assert _optional_variants(props["edition_type"])[0]["enum"] == [
            "festival",
            "bourse",
            "capsule_exchange",
        ]


class TestRequiredPhysicalDimensions:
    """No defensible generic default exists for a room's or table type's real
    measured dimensions, so both must be required rather than silently filled
    in (previously 20x15m rooms / 0.7x1.8m tables)."""

    async def test_create_table_type_requires_dimensions(self, tool_schemas):
        required = set(tool_schemas["create_table_type"]["required"])
        assert {"width_m", "length_m"} <= required

    async def test_create_room_requires_dimensions(self, tool_schemas):
        required = set(tool_schemas["create_room"]["required"])
        assert {"width_m", "length_m"} <= required


class TestNoRedundantDateUnions:
    """A ``dt_date | str`` (or ``datetime | str``) annotation renders as two
    functionally-overlapping 'string' variants in the JSON schema's ``anyOf``
    (one with ``format: date``/``date-time``, one bare) — pure noise for an
    MCP client. Each date/datetime param should expose at most one."""

    @pytest.mark.parametrize(
        ("tool_name", "param_name"),
        [
            ("create_layout", "date"),
            ("copy_layout", "date"),
            ("create_event", "date"),
            ("update_event", "date"),
            ("create_event", "registrations_open_from"),
            ("update_event", "registrations_open_from"),
        ],
    )
    async def test_no_duplicate_string_variants(self, tool_schemas, tool_name, param_name):
        schema = tool_schemas[tool_name]["properties"][param_name]
        variants = schema.get("anyOf", [schema])
        string_variants = [v for v in variants if v.get("type") == "string"]
        assert len(string_variants) <= 1, f"{tool_name}.{param_name} exposes redundant string variants: {variants}"
