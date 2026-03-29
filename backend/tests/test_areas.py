"""Tests for the areas API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_layout_prerequisites


@pytest.mark.anyio
async def test_areas_require_admin(client):
    r = await client.get("/api/areas")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_area_crud(client):
    layout_id = await _create_layout_prerequisites(client)

    payload = {
        "layout_id": layout_id,
        "label": "DJ Stage",
        "icon": "bi-music-note-beamed",
        "width_m": 3.0,
        "length_m": 2.0,
        "x": 25.0,
        "y": 50.0,
    }

    r = await client.post("/api/areas", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    area = r.json()
    assert area["label"] == "DJ Stage"
    assert area["icon"] == "bi-music-note-beamed"
    assert area["exhibitor_id"] is None
    area_id = area["id"]

    # List (filter by layout)
    r = await client.get("/api/areas", params={"layout_id": layout_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1

    # Get single
    r = await client.get(f"/api/areas/{area_id}", headers=ADMIN_HEADERS)
    assert r.json()["label"] == "DJ Stage"

    # Update position
    r = await client.put(
        f"/api/areas/{area_id}",
        json={"x": 40.0, "label": "Main Stage"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["x"] == 40.0
    assert r.json()["label"] == "Main Stage"

    # Delete
    r = await client.delete(f"/api/areas/{area_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/areas", params={"layout_id": layout_id}, headers=ADMIN_HEADERS)
    assert r.json() == []


@pytest.mark.anyio
async def test_area_linked_to_exhibitor(client):
    """An area can be assigned to an exhibitor; clearing works too."""
    layout_id = await _create_layout_prerequisites(client)
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Oyster Bar", "type": "vendor"},
        headers=ADMIN_HEADERS,
    )
    exhibitor_id = r.json()["id"]

    r = await client.post(
        "/api/areas",
        json={
            "layout_id": layout_id,
            "label": "Oyster Stand",
            "exhibitor_id": exhibitor_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    area_id = r.json()["id"]
    assert r.json()["exhibitor_id"] == exhibitor_id

    # Clear exhibitor assignment
    r = await client.put(f"/api/areas/{area_id}", json={"exhibitor_id": None}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["exhibitor_id"] is None


@pytest.mark.anyio
async def test_area_invalid_layout(client):
    r = await client.post(
        "/api/areas",
        json={"layout_id": "nonexistent", "label": "Ghost Area"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404
