"""Tests for the volunteers CSV export endpoint (insurance reporting)."""

from __future__ import annotations

import csv
import io

import pytest

from tests.helpers import ADMIN_HEADERS


@pytest.mark.anyio
async def test_volunteers_export_requires_auth(unauth_client):
    r = await unauth_client.get("/api/volunteers/export")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_volunteers_export_one_row_per_period(client):
    r = await client.post(
        "/api/volunteers",
        json={
            "name": "Multi Period",
            "address": "Kerkstraat 1",
            "national_register_number": "85010199999",
            "eid_document_number": "BEI998877",
            "help_periods": [
                {"first_help_day": "2099-03-20", "last_help_day": "2099-03-21"},
                {"first_help_day": "2099-03-27", "last_help_day": "2099-03-28"},
            ],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.get("/api/volunteers/export", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")

    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[0] == ["Name", "National Register Number", "Address", "Period Start", "Period End"]
    data_rows = [row for row in rows[1:] if row[0] == "Multi Period"]
    assert len(data_rows) == 2
    assert data_rows[0][1] == "85010199999"
    assert data_rows[0][3] == "2099-03-20"
    assert data_rows[0][4] == "2099-03-21"


@pytest.mark.anyio
async def test_volunteers_export_excludes_inactive(client):
    r = await client.post(
        "/api/volunteers",
        json={
            "name": "Inactive Volunteer",
            "national_register_number": "11111111199",
            "eid_document_number": "BEI111111",
            "active": False,
            "help_periods": [{"first_help_day": "2099-03-20"}],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.get("/api/volunteers/export", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    rows = list(csv.reader(io.StringIO(r.text)))
    names = [row[0] for row in rows[1:]]
    assert "Inactive Volunteer" not in names
