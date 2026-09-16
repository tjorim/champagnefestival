"""Tests for the per-edition admin scratchpad API."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditEntry
from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD


async def _create_edition(client, edition_id: str = "edition-scratchpad-test") -> str:
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={"id": edition_id, "year": 2026, "month": "march", "venue_id": venue_id, "active": False},
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201
    return edition_id


@pytest.mark.anyio
async def test_get_edition_scratchpad_requires_admin(unauth_client):
    r = await unauth_client.get("/api/editions/nonexistent/scratchpad")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_get_edition_scratchpad_rejects_non_admin(forbidden_client):
    r = await forbidden_client.get("/api/editions/nonexistent/scratchpad")
    assert r.status_code == 403


@pytest.mark.anyio
async def test_get_edition_scratchpad_not_found(client):
    r = await client.get("/api/editions/nonexistent/scratchpad", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_get_edition_scratchpad_defaults_to_empty(client):
    edition_id = await _create_edition(client)
    r = await client.get(f"/api/editions/{edition_id}/scratchpad", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["content"] == ""


@pytest.mark.anyio
async def test_put_edition_scratchpad_requires_admin(unauth_client):
    r = await unauth_client.put("/api/editions/nonexistent/scratchpad", json={"content": "Fri: bar"})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_put_edition_scratchpad_rejects_non_admin(forbidden_client):
    r = await forbidden_client.put("/api/editions/nonexistent/scratchpad", json={"content": "Fri: bar"})
    assert r.status_code == 403


@pytest.mark.anyio
async def test_put_edition_scratchpad_not_found(client):
    r = await client.put("/api/editions/nonexistent/scratchpad", json={"content": "Fri: bar"}, headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_admin_updates_edition_scratchpad_content_and_audits(client, db_session):
    edition_id = await _create_edition(client)
    payload = {"content": "Fri: bar\nSat: serving\n\nremember to order more ice"}
    r = await client.put(f"/api/editions/{edition_id}/scratchpad", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["content"] == payload["content"]

    r = await client.get(f"/api/editions/{edition_id}/scratchpad", headers=ADMIN_HEADERS)
    assert r.json()["content"] == payload["content"]

    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "edition_scratchpad_updated",
            AuditEntry.resource_type == "edition",
            AuditEntry.resource_id == edition_id,
        )
    )
    assert audit is not None


@pytest.mark.anyio
async def test_edition_scratchpad_is_isolated_per_edition(client):
    edition_a = await _create_edition(client, "edition-scratchpad-a")
    edition_b = await _create_edition(client, "edition-scratchpad-b")

    await client.put(f"/api/editions/{edition_a}/scratchpad", json={"content": "A's notes"}, headers=ADMIN_HEADERS)

    r = await client.get(f"/api/editions/{edition_b}/scratchpad", headers=ADMIN_HEADERS)
    assert r.json()["content"] == ""


@pytest.mark.anyio
async def test_put_edition_scratchpad_rejects_content_over_max_length(client):
    edition_id = await _create_edition(client)
    r = await client.put(f"/api/editions/{edition_id}/scratchpad", json={"content": "x" * 20001}, headers=ADMIN_HEADERS)
    assert r.status_code == 422


@pytest.mark.anyio
async def test_put_edition_scratchpad_accepts_empty_content(client):
    edition_id = await _create_edition(client)
    await client.put(f"/api/editions/{edition_id}/scratchpad", json={"content": "something"}, headers=ADMIN_HEADERS)
    r = await client.put(f"/api/editions/{edition_id}/scratchpad", json={"content": ""}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["content"] == ""


@pytest.mark.anyio
async def test_edition_scratchpad_never_appears_in_edition_responses(client):
    """scratchpad is deliberately its own lightweight resource, excluded from
    both the admin EditionOut and the public EditionPublicOut shapes."""
    edition_id = await _create_edition(client)
    await client.put(
        f"/api/editions/{edition_id}/scratchpad", json={"content": "secret admin notes"}, headers=ADMIN_HEADERS
    )

    admin_response = await client.get(f"/api/editions/{edition_id}", headers=ADMIN_HEADERS)
    assert "scratchpad" not in admin_response.json()

    admin_list_response = await client.get("/api/editions", headers=ADMIN_HEADERS)
    assert all("scratchpad" not in edition for edition in admin_list_response.json())
