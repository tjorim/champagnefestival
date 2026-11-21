"""MCP capability manifest."""

from __future__ import annotations

from typing import Literal

from app.schemas.base import ResponseModel


class McpToolCapabilityOut(ResponseModel):
    name: str
    effect: Literal["read", "write"]
    requires_confirmation: bool
    access: dict[str, str]
    """``{"role": <minimum role>}``."""


class McpCapabilitiesOut(ResponseModel):
    contract_version: int
    enabled: bool
    mount_path: str
    version: str | None
    tools: list[McpToolCapabilityOut]
    resources: list[object]
    prompts: list[object]
