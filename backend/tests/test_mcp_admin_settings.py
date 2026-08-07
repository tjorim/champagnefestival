"""Tests for the admin (write) settings MCP tools."""

from __future__ import annotations

from app.mcp.admin import settings as mcp_settings
from tests.helpers import mcp_session_factory


async def test_get_settings_creates_default_row(db_session):
    factory = mcp_session_factory(db_session)
    settings = await mcp_settings.get_settings(factory)
    assert settings["maintenance_mode"] is False


async def test_set_maintenance_mode(db_session):
    factory = mcp_session_factory(db_session)

    updated = await mcp_settings.set_maintenance_mode(factory, "admin-1", maintenance_mode=True)
    assert updated["maintenance_mode"] is True

    fetched = await mcp_settings.get_settings(factory)
    assert fetched["maintenance_mode"] is True

    updated = await mcp_settings.set_maintenance_mode(factory, "admin-1", maintenance_mode=False)
    assert updated["maintenance_mode"] is False
