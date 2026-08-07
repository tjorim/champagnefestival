"""Tests for the managed integration-client REST endpoints (admin only)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS


@pytest.mark.anyio
async def test_create_list_revoke_rotate_integration_client(client):
    r = await client.post(
        "/api/integration-clients",
        json={"name": "Home Assistant", "allowed_role": "volunteer"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    created = r.json()
    assert created["name"] == "Home Assistant"
    assert created["allowed_role"] == "volunteer"
    assert created["is_active"] is True
    assert created["key"].startswith("cfic_")
    client_id = created["id"]

    r = await client.get("/api/integration-clients", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    listed = r.json()
    assert any(c["id"] == client_id for c in listed)
    # The list/detail shape never includes key material.
    assert all("key" not in c and "key_hash" not in c for c in listed)

    r = await client.post(f"/api/integration-clients/{client_id}/rotate", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    rotated = r.json()
    assert rotated["key"].startswith("cfic_")
    assert rotated["key"] != created["key"]

    r = await client.post(f"/api/integration-clients/{client_id}/revoke", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    revoked = r.json()
    assert revoked["is_active"] is False
    assert revoked["revoked_at"] is not None


@pytest.mark.anyio
async def test_create_integration_client_requires_admin(unauth_client):
    r = await unauth_client.post(
        "/api/integration-clients", json={"name": "X", "allowed_role": "volunteer"}
    )
    assert r.status_code == 401


@pytest.mark.anyio
async def test_volunteer_cannot_create_integration_client(volunteer_client):
    r = await volunteer_client.post(
        "/api/integration-clients", json={"name": "X", "allowed_role": "volunteer"}
    )
    assert r.status_code == 403


@pytest.mark.anyio
async def test_create_integration_client_rejects_invalid_role(client):
    r = await client.post(
        "/api/integration-clients", json={"name": "X", "allowed_role": "public"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 422  # rejected by the Literal["admin", "volunteer"] schema


@pytest.mark.anyio
async def test_revoke_unknown_client_404(client):
    r = await client.post("/api/integration-clients/nonexistent/revoke", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_revoke_already_revoked_409(client):
    r = await client.post(
        "/api/integration-clients", json={"name": "X", "allowed_role": "volunteer"}, headers=ADMIN_HEADERS
    )
    client_id = r.json()["id"]
    await client.post(f"/api/integration-clients/{client_id}/revoke", headers=ADMIN_HEADERS)

    r = await client.post(f"/api/integration-clients/{client_id}/revoke", headers=ADMIN_HEADERS)
    assert r.status_code == 409


@pytest.mark.anyio
async def test_rotate_revoked_client_409(client):
    r = await client.post(
        "/api/integration-clients", json={"name": "X", "allowed_role": "volunteer"}, headers=ADMIN_HEADERS
    )
    client_id = r.json()["id"]
    await client.post(f"/api/integration-clients/{client_id}/revoke", headers=ADMIN_HEADERS)

    r = await client.post(f"/api/integration-clients/{client_id}/rotate", headers=ADMIN_HEADERS)
    assert r.status_code == 409


@pytest.mark.anyio
async def test_create_integration_client_writes_audit_entry(client):
    r = await client.post(
        "/api/integration-clients", json={"name": "X", "allowed_role": "volunteer"}, headers=ADMIN_HEADERS
    )
    client_id = r.json()["id"]

    r = await client.get("/api/audit", params={"resource_type": "integration_client"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    entries = r.json()
    assert any(e["resource_id"] == client_id and e["action"] == "integration_client_created" for e in entries)
