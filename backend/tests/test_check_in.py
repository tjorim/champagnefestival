"""Tests for the check-in flow."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _post_registration


@pytest.mark.anyio
async def test_check_in_flow(client):
    r = await _post_registration(client)
    assert r.status_code == 201
    res_id = r.json()["id"]

    # Get the token from admin detail
    r = await client.get(f"/api/registrations/{res_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    token = r.json()["check_in_token"]

    # Verify token via POST lookup (token in body, not query string)
    r = await client.post(f"/api/check-in/{res_id}/lookup", json={"token": token})
    assert r.status_code == 200

    # Check in
    r = await client.post(f"/api/check-in/{res_id}", json={"token": token, "issue_strap": True})
    assert r.status_code == 200
    body = r.json()
    assert body["already_checked_in"] is False
    assert body["registration"]["checked_in"] is True
    assert body["registration"]["strap_issued"] is True

    # Second scan
    r = await client.post(f"/api/check-in/{res_id}", json={"token": token, "issue_strap": True})
    assert r.json()["already_checked_in"] is True


@pytest.mark.anyio
async def test_check_in_wrong_token(client):
    r = await _post_registration(client, path="/api/registrations")
    res_id = r.json()["id"]
    r = await client.post(f"/api/check-in/{res_id}", json={"token": "wrong", "issue_strap": True})
    assert r.status_code == 401
