"""Tests for the public floor plan (#1253)."""

from __future__ import annotations

import json
from datetime import date

import pytest

from app.services import stands_service
from tests.helpers import ADMIN_HEADERS, _post_registration
from tests.test_edition_stands import EDITION_ID, _post, _public_get, _setup, _stand


@pytest.fixture(autouse=True)
def during_festival(monkeypatch):
    """Run every test on the first festival day (2099-03-20) unless it overrides this."""
    monkeypatch.setattr(stands_service, "_today", lambda: date(2099, 3, 20))


def _url() -> str:
    return f"/api/editions/{EDITION_ID}/plan"


@pytest.mark.anyio
async def test_plan_is_public_and_lists_days_rooms_and_areas(client):
    ctx = await _setup(client)
    layouts, producers = ctx["layouts"], ctx["producers"]
    await _stand(client, layouts[("fri", "Hall 5")], "Stand 12", producers["Bollinger"])
    await _stand(client, layouts[("fri", "Hall 5")], "Main Stage", None)  # no organization: still helps orientation
    await _stand(client, layouts[("sat", "Cellar")], "Stand 3", producers["Bollinger"])

    response = await _public_get(client, _url())

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=60"
    data = response.json()
    assert data["edition_id"] == EDITION_ID
    # Layouts without any area (Cellar on Friday, Hall 5 on Saturday) are left out.
    assert [(day["date"], [room["name"] for room in day["rooms"]]) for day in data["days"]] == [
        ("2099-03-20", ["Hall 5"]),
        ("2099-03-21", ["Cellar"]),
    ]
    friday = data["days"][0]
    assert friday["event_id"] == ctx["events"]["fri"]["id"]
    room = friday["rooms"][0]
    assert room["id"] == ctx["rooms"]["Hall 5"]["id"]
    assert (room["width_m"], room["length_m"]) == (20.0, 15.0)
    assert room["color"]
    assert [area["label"] for area in room["areas"]] == ["Main Stage", "Stand 12"]
    stage, stand = room["areas"]
    assert stage["organization_id"] is None
    assert stand["organization_id"] == producers["Bollinger"]["id"]
    assert set(stand) == {
        "id",
        "label",
        "icon",
        "x",
        "y",
        "rotation",
        "width_m",
        "length_m",
        "organization_id",
    }


@pytest.mark.anyio
async def test_inactive_event_and_inactive_organization_areas_are_excluded(client):
    ctx = await _setup(client)
    await _stand(client, ctx["layouts"][("fri", "Hall 5")], "Stand 1", ctx["producers"]["Bollinger"])
    await _stand(client, ctx["layouts"][("fri", "Hall 5")], "Stand 5", ctx["producers"]["Taittinger"])
    await _stand(client, ctx["layouts"][("sat", "Hall 5")], "Stand 2", ctx["producers"]["Bollinger"])
    r = await client.put(f"/api/events/{ctx['events']['sat']['id']}", json={"active": False}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    r = await client.put(
        f"/api/organizations/{ctx['producers']['Taittinger']['id']}", json={"active": False}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200, r.text

    data = (await _public_get(client, _url())).json()

    assert [day["date"] for day in data["days"]] == ["2099-03-20"]
    assert [area["label"] for area in data["days"][0]["rooms"][0]["areas"]] == ["Stand 1"]


@pytest.mark.anyio
async def test_inactive_or_unknown_edition_is_not_found(client):
    await _setup(client, active=False)

    assert (await _public_get(client, _url())).status_code == 404
    assert (await _public_get(client, "/api/editions/nope/plan")).status_code == 404


@pytest.mark.anyio
async def test_response_never_contains_table_or_registration_data(client):
    ctx = await _setup(client)
    layout = ctx["layouts"][("fri", "Hall 5")]
    await _stand(client, layout, "Stand 12", ctx["producers"]["Bollinger"])

    table_type = await _post(
        client,
        "/api/table-types",
        {"name": "Standard", "venue_id": ctx["venue"]["id"], "capacity": 6, "width_m": 0.7, "length_m": 1.8},
    )
    table = await _post(
        client, "/api/tables", {"name": "SecretTable7", "table_type_id": table_type["id"], "layout_id": layout["id"]}
    )
    registration = await _post_registration(
        client, event=ctx["events"]["fri"], guest_count=3, name="Privacy Probe", email="probe@example.com"
    )
    assert registration.status_code == 201, registration.text
    registration_id = registration.json()["id"]
    assigned = await client.put(
        f"/api/registrations/{registration_id}",
        json={"allocations": [{"table_id": table["id"], "guest_count": 3}]},
        headers=ADMIN_HEADERS,
    )
    assert assigned.status_code == 200, assigned.text

    response = await _public_get(client, _url())

    assert response.status_code == 200
    data = response.json()
    assert set(data) == {"edition_id", "days"}
    for day in data["days"]:
        assert set(day) == {"event_id", "date", "rooms"}
        for room in day["rooms"]:
            assert set(room) == {"id", "name", "width_m", "length_m", "color", "areas"}
    raw = response.text.lower()
    for forbidden in (
        "tables",
        "registration",
        "guest",
        "capacity",
        "allocation",
        "occupied",
        "layout",
        "secrettable7",
        "privacy probe",
        "probe@example.com",
        table["id"].lower(),
        registration_id.lower(),
        layout["id"].lower(),
    ):
        assert forbidden not in raw
    # The table is not even a shape on the plan.
    assert [len(room["areas"]) for day in data["days"] for room in day["rooms"]] == [1]
    assert json.loads(response.text) == data


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("today", "published"),
    [
        (date(2099, 3, 19), False),
        (date(2099, 3, 20), True),
        (date(2099, 3, 28), True),
        (date(2099, 3, 29), False),
    ],
)
async def test_plan_only_published_during_the_festival_window(client, monkeypatch, today, published):
    ctx = await _setup(client)
    await _stand(client, ctx["layouts"][("fri", "Hall 5")], "Stand 12", ctx["producers"]["Bollinger"])
    monkeypatch.setattr(stands_service, "_today", lambda: today)

    response = await _public_get(client, _url())

    assert response.status_code == 200
    assert bool(response.json()["days"]) is published
