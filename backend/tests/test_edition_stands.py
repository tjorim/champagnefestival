"""Tests for the public producer-stand lookup (#1223)."""

from __future__ import annotations

import json
from datetime import date

import pytest

from app.auth import require_admin, require_volunteer
from app.main import app
from app.services import stands_service
from tests.helpers import ADMIN_HEADERS, _post_registration

VENUE_PAYLOAD = {
    "name": "Stand Hall",
    "address": "1 Main St",
    "city": "Brussels",
    "postal_code": "1000",
    "country": "Belgium",
    "lat": 50.85,
    "lng": 4.35,
}

EDITION_ID = "stands-2026"


@pytest.fixture(autouse=True)
def during_festival(monkeypatch):
    """Run every test on the first festival day (2099-03-20) unless it overrides this."""
    monkeypatch.setattr(stands_service, "_today", lambda: date(2099, 3, 20))


async def _post(client, path: str, payload: dict) -> dict:
    response = await client.post(path, json=payload, headers=ADMIN_HEADERS)
    assert response.status_code == 201, response.text
    return response.json()


async def _setup(client, *, active: bool = True) -> dict:
    """Venue, two rooms, two festival days and a layout per day/room; no stands yet."""
    venue = await _post(client, "/api/venues", VENUE_PAYLOAD)
    rooms = {
        name: await _post(
            client, "/api/rooms", {"name": name, "width_m": 20.0, "length_m": 15.0, "venue_id": venue["id"]}
        )
        for name in ("Hall 5", "Cellar")
    }
    producers = {
        name: await _post(client, "/api/organizations", {"name": name, "type": "producer"})
        for name in ("Bollinger", "Taittinger", "Krug")
    }
    outsider = await _post(client, "/api/organizations", {"name": "Not In Lineup", "type": "producer"})
    await _post(
        client,
        "/api/editions",
        {
            "id": EDITION_ID,
            "year": 2099,
            "month": "march",
            "venue_id": venue["id"],
            "organizations": [producers["Bollinger"]["id"], producers["Taittinger"]["id"], producers["Krug"]["id"]],
            "active": active,
        },
    )
    events = {}
    for day, event_date in (("fri", "2099-03-20"), ("sat", "2099-03-21")):
        events[day] = await _post(
            client,
            "/api/events",
            {
                "edition_id": EDITION_ID,
                "title_en": day,
                "date": event_date,
                "start_time": "14:00",
                "category": "general",
                "registration_required": True,
                "active": True,
            },
        )
    layouts = {}
    for day, event in events.items():
        for room_name, room in rooms.items():
            layouts[(day, room_name)] = await _post(
                client, "/api/layouts", {"room_id": room["id"], "event_id": event["id"]}
            )
    return {
        "venue": venue,
        "rooms": rooms,
        "producers": producers,
        "outsider": outsider,
        "events": events,
        "layouts": layouts,
    }


async def _stand(client, layout: dict, label: str, organization: dict | None) -> dict:
    return await _post(
        client,
        "/api/areas",
        {
            "layout_id": layout["id"],
            "label": label,
            "organization_id": organization["id"] if organization else None,
        },
    )


async def _public_get(client, path: str):
    """GET without any admin/volunteer override, proving the route needs no auth."""
    app.dependency_overrides.pop(require_admin, None)
    app.dependency_overrides.pop(require_volunteer, None)
    return await client.get(path)


@pytest.mark.anyio
async def test_stands_are_public_and_listed_per_organization_and_day(client):
    ctx = await _setup(client)
    producers, layouts = ctx["producers"], ctx["layouts"]
    await _stand(client, layouts[("fri", "Hall 5")], "Stand 12", producers["Bollinger"])
    await _stand(client, layouts[("sat", "Cellar")], "Stand 3", producers["Bollinger"])
    await _stand(client, layouts[("fri", "Hall 5")], "Stand 7", producers["Krug"])

    response = await _public_get(client, f"/api/editions/{EDITION_ID}/stands")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=60"
    data = response.json()
    assert data["edition_id"] == EDITION_ID
    assert [item["name"] for item in data["organizations"]] == ["Bollinger", "Krug"]
    bollinger, krug = data["organizations"]
    assert bollinger["organization_id"] == producers["Bollinger"]["id"]
    assert [(s["date"], s["room_name"], s["label"]) for s in bollinger["stands"]] == [
        ("2099-03-20", "Hall 5", "Stand 12"),
        ("2099-03-21", "Cellar", "Stand 3"),
    ]
    assert bollinger["stands"][0]["event_id"] == ctx["events"]["fri"]["id"]
    assert [s["label"] for s in krug["stands"]] == ["Stand 7"]


@pytest.mark.anyio
async def test_any_organization_type_with_a_stand_is_listed_even_outside_the_lineup(client):
    ctx = await _setup(client)
    layout = ctx["layouts"][("fri", "Hall 5")]
    sponsor = await _post(client, "/api/organizations", {"name": "Acme Sponsor", "type": "sponsor"})
    vendor = await _post(client, "/api/organizations", {"name": "Cheese Vendor", "type": "vendor"})
    await _stand(client, layout, "Stand 1", ctx["producers"]["Bollinger"])
    await _stand(client, layout, "Stand 99", ctx["outsider"])  # producer that is not in the edition lineup
    await _stand(client, layout, "Stand 50", sponsor)
    await _stand(client, layout, "Stand 60", vendor)  # vendors cannot join a lineup but can have a stand
    await _stand(client, layout, "DJ Stage", None)  # area without an organization

    data = (await _public_get(client, f"/api/editions/{EDITION_ID}/stands")).json()

    assert [item["name"] for item in data["organizations"]] == [
        "Acme Sponsor",
        "Bollinger",
        "Cheese Vendor",
        "Not In Lineup",
    ]
    # Lineup members without an assigned stand (Krug, Taittinger) and unowned areas show nothing.
    assert "Krug" not in json.dumps(data)
    assert "DJ Stage" not in json.dumps(data)


@pytest.mark.anyio
async def test_inactive_event_and_inactive_organization_are_excluded(client):
    ctx = await _setup(client)
    await _stand(client, ctx["layouts"][("fri", "Hall 5")], "Stand 1", ctx["producers"]["Bollinger"])
    await _stand(client, ctx["layouts"][("sat", "Hall 5")], "Stand 2", ctx["producers"]["Bollinger"])
    await _stand(client, ctx["layouts"][("sat", "Hall 5")], "Stand 5", ctx["producers"]["Taittinger"])
    saturday = ctx["events"]["sat"]
    r = await client.put(f"/api/events/{saturday['id']}", json={"active": False}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    r = await client.put(
        f"/api/organizations/{ctx['producers']['Taittinger']['id']}", json={"active": False}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200, r.text

    data = (await _public_get(client, f"/api/editions/{EDITION_ID}/stands")).json()

    assert [item["name"] for item in data["organizations"]] == ["Bollinger"]
    assert [s["label"] for s in data["organizations"][0]["stands"]] == ["Stand 1"]


@pytest.mark.anyio
async def test_inactive_or_unknown_edition_is_not_found(client):
    await _setup(client, active=False)

    assert (await _public_get(client, f"/api/editions/{EDITION_ID}/stands")).status_code == 404
    assert (await _public_get(client, "/api/editions/nope/stands")).status_code == 404


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

    response = await _public_get(client, f"/api/editions/{EDITION_ID}/stands")

    assert response.status_code == 200
    data = response.json()
    assert set(data) == {"edition_id", "organizations"}
    for organization in data["organizations"]:
        assert set(organization) == {"organization_id", "name", "stands"}
        for stand in organization["stands"]:
            assert set(stand) == {"event_id", "date", "room_name", "label"}
    raw = response.text.lower()
    for forbidden in (
        "tables",
        "registration",
        "guest",
        "capacity",
        "allocation",
        "occupied",
        "secrettable7",
        "privacy probe",
        "probe@example.com",
        table["id"].lower(),
        registration_id.lower(),
    ):
        assert forbidden not in raw


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("today", "published"),
    [
        (date(2099, 3, 19), False),  # day before the first festival day
        (date(2099, 3, 20), True),  # first day
        (date(2099, 3, 21), True),  # last day
        (date(2099, 3, 28), True),  # last day + STANDS_VISIBLE_DAYS_AFTER (a week)
        (date(2099, 3, 29), False),  # grace period over
    ],
)
async def test_stands_only_published_during_the_festival_window(client, monkeypatch, today, published):
    ctx = await _setup(client)
    await _stand(client, ctx["layouts"][("fri", "Hall 5")], "Stand 12", ctx["producers"]["Bollinger"])
    monkeypatch.setattr(stands_service, "_today", lambda: today)

    response = await _public_get(client, f"/api/editions/{EDITION_ID}/stands")

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["organizations"]]
    assert names == (["Bollinger"] if published else [])


def test_window_is_closed_without_event_days():
    assert stands_service.stands_window_is_open([], date(2099, 3, 20)) is False
