"""Tests for the check-in flow."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event, _post_registration


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


@pytest.mark.anyio
async def test_many_guests_can_check_in_from_one_ip(client):
    event = await _create_event(client)
    registrations: list[tuple[str, str]] = []
    for index in range(4):
        created = await _post_registration(
            client,
            event=event,
            name=f"Shared Network Guest {index}",
            email=f"shared-network-{index}@example.com",
        )
        assert created.status_code == 201
        registration_id = created.json()["id"]
        detail = await client.get(f"/api/registrations/{registration_id}", headers=ADMIN_HEADERS)
        registrations.append((registration_id, detail.json()["check_in_token"]))

    for registration_id, token in registrations:
        lookup = await client.post(f"/api/check-in/{registration_id}/lookup", json={"token": token})
        assert lookup.status_code == 200
        checked_in = await client.post(f"/api/check-in/{registration_id}", json={"token": token})
        assert checked_in.status_code == 200
