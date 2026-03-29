"""Tests for the contact form endpoint."""

from __future__ import annotations

import pytest


@pytest.mark.anyio
async def test_contact_submission(client):
    """Valid contact form submission returns 200 OK."""
    r = await client.post(
        "/api/contact",
        json={"name": "Alice", "email": "alice@example.com", "message": "Hello!"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


@pytest.mark.anyio
async def test_contact_invalid_email(client):
    """Invalid email is rejected with 422."""
    r = await client.post(
        "/api/contact",
        json={"name": "Alice", "email": "not-an-email", "message": "Hello!"},
    )
    assert r.status_code == 422
