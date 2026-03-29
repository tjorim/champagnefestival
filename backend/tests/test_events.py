"""Tests for the events API."""

from __future__ import annotations

import pytest


@pytest.mark.anyio
async def test_list_events_requires_admin(client):
    response = await client.get("/api/events")
    assert response.status_code == 401
