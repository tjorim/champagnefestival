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
    assert listed.json()["items"][0]["message"] == "Hello!"
    handled = await client.put(f"/api/contact/{SUBMISSION_ID}/handled")
    assert handled.status_code == 200
    handled_at = handled.json()["handled_at"]
    assert handled_at is not None
    repeated = await client.put(f"/api/contact/{SUBMISSION_ID}/handled")
    assert repeated.json()["handled_at"] == handled_at


@pytest.mark.anyio
async def test_contact_admin_list_requires_admin(unauth_client):
    assert (await unauth_client.get("/api/contact")).status_code == 401


@pytest.mark.anyio
async def test_contact_admin_list_filters_pages_and_counts_the_whole_queue(client):
    for index, (name, text) in enumerate([("Alice", "Hello!"), ("Bob", "Table for 100%"), ("Carol", "Other")]):
        submission = f"1c51e9a0-2481-4a79-9895-f314449dc41{index}"
        await client.post(
            "/api/contact",
            json={"submission_id": submission, "name": name, "email": f"{name.lower()}@example.com", "message": text},
        )
    await client.put("/api/contact/1c51e9a0-2481-4a79-9895-f314449dc410/handled")

    unhandled = (await client.get("/api/contact", params={"status": "unhandled"})).json()
    assert unhandled["total"] == 2
    assert {item["name"] for item in unhandled["items"]} == {"Bob", "Carol"}

    handled = (await client.get("/api/contact", params={"status": "handled"})).json()
    assert [item["name"] for item in handled["items"]] == ["Alice"]

    paged = (await client.get("/api/contact", params={"limit": 1, "page": 2})).json()
    assert paged["total"] == 3
    assert len(paged["items"]) == 1
    assert paged["page"] == 2

    # `%` is a literal character, not a wildcard, and search honours the status filter.
    assert (await client.get("/api/contact", params={"q": "100%"})).json()["total"] == 1
    assert (await client.get("/api/contact", params={"q": "%"})).json()["total"] == 1
    assert (await client.get("/api/contact", params={"q": "alice", "status": "unhandled"})).json()["total"] == 0
    assert (await client.get("/api/contact", params={"status": "bogus"})).status_code == 422
