"""Tests for the admin scratchpad API.

Concurrent-first-request atomicity for the fixed singleton row follows the
same reasoning as test_settings.py's — not exercised here for the same
test-client-session-sharing reason; see that file's module docstring.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import AuditEntry, Edition
from app.services import scratchpad_service
from tests.helpers import ADMIN_HEADERS


@pytest.mark.anyio
async def test_get_scratchpad_requires_admin(unauth_client):
    r = await unauth_client.get("/api/scratchpad")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_get_scratchpad_rejects_non_admin(forbidden_client):
    r = await forbidden_client.get("/api/scratchpad")
    assert r.status_code == 403


@pytest.mark.anyio
async def test_get_scratchpad_creates_the_row_lazily(client):
    r = await client.get("/api/scratchpad", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["content"] == ""

    # A second read returns the same row, not a duplicate.
    r = await client.get("/api/scratchpad", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["content"] == ""


@pytest.mark.anyio
async def test_put_scratchpad_requires_admin(unauth_client):
    r = await unauth_client.put("/api/scratchpad", json={"content": "Fri: bar"})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_put_scratchpad_rejects_non_admin(forbidden_client):
    r = await forbidden_client.put("/api/scratchpad", json={"content": "Fri: bar"})
    assert r.status_code == 403


@pytest.mark.anyio
async def test_admin_updates_scratchpad_content_and_audits(client, db_session):
    payload = {"content": "Fri: bar\nSat: serving\n\nremember to order more ice"}
    r = await client.put("/api/scratchpad", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["content"] == payload["content"]

    r = await client.get("/api/scratchpad", headers=ADMIN_HEADERS)
    assert r.json()["content"] == payload["content"]

    audit = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "scratchpad_updated",
            AuditEntry.resource_type == "admin_scratchpad",
        )
    )
    assert audit is not None


@pytest.mark.anyio
async def test_put_scratchpad_rejects_content_over_max_length(client):
    r = await client.put("/api/scratchpad", json={"content": "x" * 20001}, headers=ADMIN_HEADERS)
    assert r.status_code == 422


@pytest.mark.anyio
async def test_put_scratchpad_accepts_empty_content(client):
    await client.put("/api/scratchpad", json={"content": "something"}, headers=ADMIN_HEADERS)
    r = await client.put("/api/scratchpad", json={"content": ""}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["content"] == ""


@pytest.mark.anyio
async def test_get_or_create_scratchpad_does_not_mislabel_unrelated_integrity_errors(db_session):
    """Mirrors test_settings.py's equivalent: only an `admin_scratchpad_pkey`
    violation is the expected concurrent-first-request race; anything else
    must propagate as-is rather than being silently swallowed."""
    db_session.add(
        Edition(
            id="edition-fk-race-scratchpad",
            year=2099,
            month="march",
            venue_id="venue-does-not-exist",
            edition_type="bourse",
            active=False,
        )
    )
    with pytest.raises(IntegrityError):
        await scratchpad_service.get_or_create_scratchpad(db_session)
