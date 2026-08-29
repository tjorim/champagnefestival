"""Tests for the site-wide settings API (currently just maintenance mode).

Concurrent-first-request atomicity (two requests racing to create the fixed
singleton row) is deliberately not covered here: this test client's
dependency override shares one AsyncSession across every call in a test,
which can't reproduce the real per-request-session race a production
server has. That behavior was verified separately, live, with genuinely
concurrent HTTP connections against a running server (10/10 returning 200
with a single row) — see the PR description.
"""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Edition
from app.services import settings_service
from tests.helpers import ADMIN_HEADERS


@pytest.mark.anyio
async def test_get_settings_creates_the_row_lazily(unauth_client):
    """GET has no require_admin dependency at all, and the singleton row is
    created on first read — unauth_client (which makes require_admin raise
    401) still succeeds here, since that dependency is never invoked."""
    r = await unauth_client.get("/api/settings")
    assert r.status_code == 200
    assert r.json()["maintenance_mode"] is False
    assert r.headers["cache-control"] == "public, max-age=30"

    # A second read returns the same row, not a duplicate.
    r = await unauth_client.get("/api/settings")
    assert r.status_code == 200
    assert r.json()["maintenance_mode"] is False


@pytest.mark.anyio
async def test_put_settings_requires_admin(unauth_client):
    r = await unauth_client.put("/api/settings", json={"maintenance_mode": True})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_put_settings_rejects_non_admin(forbidden_client):
    r = await forbidden_client.put("/api/settings", json={"maintenance_mode": True})
    assert r.status_code == 403


@pytest.mark.anyio
async def test_put_settings_toggles_maintenance_mode(client):
    r = await client.put("/api/settings", json={"maintenance_mode": True}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["maintenance_mode"] is True

    r = await client.get("/api/settings")
    assert r.json()["maintenance_mode"] is True

    r = await client.put("/api/settings", json={"maintenance_mode": False}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["maintenance_mode"] is False


@pytest.mark.anyio
async def test_get_or_create_settings_does_not_mislabel_unrelated_integrity_errors(db_session):
    """`get_or_create_settings` runs its insert inside a SAVEPOINT
    (`db.begin_nested()`), but that savepoint flushes any *other* pending work
    already queued on the session before it's established — so an
    IntegrityError here can come from that unrelated work rather than the
    settings-row race. It must only treat an `app_settings_pkey` violation as
    the expected concurrent-first-request race (mirrors
    `editions_service.commit_or_conflict`'s constraint-name check) — an
    unrelated violation (here: an edition referencing a nonexistent venue)
    must propagate as-is, not get silently swallowed as a settings race and
    leave the caller's real error masked with a phantom settings row."""
    db_session.add(
        Edition(
            id="edition-fk-race-settings",
            year=2099,
            month="march",
            venue_id="venue-does-not-exist",
            edition_type="bourse",
            active=False,
        )
    )
    with pytest.raises(IntegrityError):
        await settings_service.get_or_create_settings(db_session)
