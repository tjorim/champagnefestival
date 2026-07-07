"""Tests for the CSV guest-list export endpoint."""

from __future__ import annotations

import csv
import io

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event, _post_registration


@pytest.mark.anyio
async def test_export_requires_auth(unauth_client):
    r = await unauth_client.get("/api/registrations/export", params={"event_id": "nonexistent"})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_export_event_not_found(client):
    r = await client.get("/api/registrations/export", params={"event_id": "nonexistent"}, headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_export_returns_csv_guest_list(client):
    event = await _create_event(client, edition_id="edition-export", title="Export Night")
    r = await _post_registration(client, event=event, name="Export Guest", email="export@example.com")
    assert r.status_code == 201

    r = await client.get("/api/registrations/export", params={"event_id": event["id"]}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]

    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[0] == [
        "Name",
        "Email",
        "Phone",
        "Table",
        "Guests",
        "Status",
        "Payment",
        "Checked In",
        "Strap Issued",
        "Notes",
    ]
    assert len(rows) == 2
    assert rows[1][0] == "Export Guest"
    assert rows[1][1] == "export@example.com"
    assert rows[1][7] == "no"  # Checked In


@pytest.mark.anyio
async def test_export_excludes_cancelled_registrations(client):
    event = await _create_event(client, edition_id="edition-export-cancelled", title="Cancel Night")
    await _post_registration(client, event=event, name="Still Here", email="here@example.com")
    r2 = await _post_registration(client, event=event, name="Cancelled Guest", email="cancelled@example.com")
    cancelled_id = r2.json()["id"]

    r = await client.put(
        f"/api/registrations/{cancelled_id}",
        json={"status": "cancelled"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get("/api/registrations/export", params={"event_id": event["id"]}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    rows = list(csv.reader(io.StringIO(r.text)))
    names = [row[0] for row in rows[1:]]
    assert "Still Here" in names
    assert "Cancelled Guest" not in names
