"""Tests for the contact form endpoint."""

from __future__ import annotations

import pytest

from app.models import ContactMessage

SUBMISSION_ID = "1c51e9a0-2481-4a79-9895-f314449dc412"


@pytest.mark.anyio
async def test_contact_submission(client, db_session):
    """Valid contact form submission returns 200 OK."""
    r = await client.post(
        "/api/contact",
        json={"submission_id": SUBMISSION_ID, "name": "Alice", "email": "alice@example.com", "message": "Hello!"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    stored = await db_session.get(ContactMessage, SUBMISSION_ID)
    assert stored is not None
    assert stored.message == "Hello!"
    assert stored.request_id is not None


@pytest.mark.anyio
async def test_contact_invalid_email(client):
    """Invalid email is rejected with 422."""
    r = await client.post(
        "/api/contact",
        json={"submission_id": SUBMISSION_ID, "name": "Alice", "email": "not-an-email", "message": "Hello!"},
    )
    assert r.status_code == 422


@pytest.mark.anyio
async def test_contact_submission_replay_does_not_duplicate_or_redeliver(client, db_session, monkeypatch):
    deliveries = 0

    async def fake_delivery(**kwargs):
        nonlocal deliveries
        deliveries += 1
        return True

    monkeypatch.setattr("app.routers.contact.send_contact_notification", fake_delivery)
    body = {"submission_id": SUBMISSION_ID, "name": "Alice", "email": "alice@example.com", "message": "Hello!"}
    assert (await client.post("/api/contact", json=body)).status_code == 200
    assert (await client.post("/api/contact", json=body)).status_code == 200
    assert deliveries == 1


@pytest.mark.anyio
async def test_contact_admin_list_and_mark_handled(client):
    body = {"submission_id": SUBMISSION_ID, "name": "Alice", "email": "alice@example.com", "message": "Hello!"}
    await client.post("/api/contact", json=body)
    listed = await client.get("/api/contact")
    assert listed.status_code == 200
    assert listed.json()[0]["message"] == "Hello!"
    handled = await client.put(f"/api/contact/{SUBMISSION_ID}/handled")
    assert handled.status_code == 200
    handled_at = handled.json()["handled_at"]
    assert handled_at is not None
    repeated = await client.put(f"/api/contact/{SUBMISSION_ID}/handled")
    assert repeated.json()["handled_at"] == handled_at


@pytest.mark.anyio
async def test_contact_admin_list_requires_admin(unauth_client):
    assert (await unauth_client.get("/api/contact")).status_code == 401
