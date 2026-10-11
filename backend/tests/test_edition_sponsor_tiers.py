"""Sponsor order and tiers on an edition's lineup (#1226)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD


async def _organization(client, name: str, org_type: str) -> int:
    response = await client.post("/api/organizations", json={"name": name, "type": org_type}, headers=ADMIN_HEADERS)
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _venue(client) -> str:
    response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    return response.json()["id"]


async def _lineup(client) -> dict[str, int]:
    return {
        "zeta": await _organization(client, "Zeta", "sponsor"),
        "alpha": await _organization(client, "Alpha", "sponsor"),
        "mid": await _organization(client, "Mid", "sponsor"),
        "late": await _organization(client, "Late", "sponsor"),
        "producer_b": await _organization(client, "Bollinger", "producer"),
        "producer_a": await _organization(client, "Ayala", "producer"),
    }


def _names(items: list[dict]) -> list[str]:
    return [item["name"] for item in items]


@pytest.mark.anyio
async def test_sponsors_follow_the_lineup_order_without_tiers(client):
    venue_id = await _venue(client)
    ids = await _lineup(client)
    lineup = [ids["zeta"], ids["producer_b"], ids["alpha"], ids["mid"], ids["producer_a"]]
    created = await client.post(
        "/api/editions",
        json={"id": "tiers-order", "year": 2099, "month": "march", "venue_id": venue_id, "organizations": lineup},
        headers=ADMIN_HEADERS,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["organizations"] == lineup
    assert _names(body["sponsors"]) == ["Zeta", "Alpha", "Mid"]
    assert _names(body["producers"]) == ["Bollinger", "Ayala"]
    assert all(sponsor["sponsor_tier"] is None for sponsor in body["sponsors"])


@pytest.mark.anyio
async def test_tiered_sponsors_are_grouped_by_tier_then_lineup_order(client):
    venue_id = await _venue(client)
    ids = await _lineup(client)
    lineup = [ids["zeta"], ids["alpha"], ids["mid"], ids["late"]]
    response = await client.post(
        "/api/editions",
        json={
            "id": "tiers-grouped",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "organizations": lineup,
            # "Late" stays untiered and goes last.
            "sponsor_tiers": {ids["zeta"]: "supporter", ids["alpha"]: "main", ids["mid"]: "supporter"},
        },
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 201, response.text
    sponsors = response.json()["sponsors"]
    assert [(s["name"], s["sponsor_tier"]) for s in sponsors] == [
        ("Alpha", "main"),
        ("Zeta", "supporter"),
        ("Mid", "supporter"),
        ("Late", None),
    ]


@pytest.mark.anyio
async def test_public_endpoint_returns_the_tiered_order(client):
    venue_id = await _venue(client)
    ids = await _lineup(client)
    await client.post(
        "/api/editions",
        json={
            "id": "tiers-public",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "organizations": [ids["zeta"], ids["alpha"], ids["producer_b"], ids["producer_a"]],
            "sponsor_tiers": {ids["alpha"]: "main", ids["zeta"]: "partner"},
        },
        headers=ADMIN_HEADERS,
    )
    await client.post(
        "/api/events",
        json={
            "edition_id": "tiers-public",
            "title_en": "Sunday",
            "date": "2099-03-22",
            "start_time": "14:00",
            "end_time": "18:00",
            "category": "general",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    data = (await client.get("/api/editions/active")).json()
    assert [(s["name"], s["sponsor_tier"]) for s in data["sponsors"]] == [("Alpha", "main"), ("Zeta", "partner")]
    # Producers keep the lineup order; the public site sorts them itself.
    assert _names(data["producers"]) == ["Bollinger", "Ayala"]
    assert "organizations" not in data


@pytest.mark.anyio
async def test_tiers_are_validated(client):
    venue_id = await _venue(client)
    ids = await _lineup(client)
    base = {"id": "tiers-invalid", "year": 2099, "month": "march", "venue_id": venue_id}

    producer_tier = await client.post(
        "/api/editions",
        json={**base, "organizations": [ids["producer_a"]], "sponsor_tiers": {ids["producer_a"]: "main"}},
        headers=ADMIN_HEADERS,
    )
    assert producer_tier.status_code == 400
    assert "only be set for sponsors" in producer_tier.json()["detail"]

    outside_lineup = await client.post(
        "/api/editions",
        json={**base, "organizations": [ids["alpha"]], "sponsor_tiers": {ids["zeta"]: "main"}},
        headers=ADMIN_HEADERS,
    )
    assert outside_lineup.status_code == 400
    assert "not in the lineup" in outside_lineup.json()["detail"]

    unknown_tier = await client.post(
        "/api/editions",
        json={**base, "organizations": [ids["alpha"]], "sponsor_tiers": {ids["alpha"]: "platinum"}},
        headers=ADMIN_HEADERS,
    )
    assert unknown_tier.status_code == 422

    listed = await client.get("/api/editions", headers=ADMIN_HEADERS)
    assert all(edition["id"] != "tiers-invalid" for edition in listed.json())


@pytest.mark.anyio
async def test_reordering_and_retiering_through_update(client):
    venue_id = await _venue(client)
    ids = await _lineup(client)
    await client.post(
        "/api/editions",
        json={
            "id": "tiers-update",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "organizations": [ids["alpha"], ids["zeta"], ids["mid"]],
            "sponsor_tiers": {ids["alpha"]: "main", ids["zeta"]: "partner"},
        },
        headers=ADMIN_HEADERS,
    )

    # Reordering the lineup alone keeps the levels.
    reordered = await client.put(
        "/api/editions/tiers-update",
        json={"organizations": [ids["mid"], ids["zeta"], ids["alpha"]]},
        headers=ADMIN_HEADERS,
    )
    assert reordered.status_code == 200, reordered.text
    assert reordered.json()["organizations"] == [ids["mid"], ids["zeta"], ids["alpha"]]
    assert [(s["name"], s["sponsor_tier"]) for s in reordered.json()["sponsors"]] == [
        ("Alpha", "main"),
        ("Zeta", "partner"),
        ("Mid", None),
    ]

    # Dropping a sponsor from the lineup drops its level; it does not come back when re-added.
    dropped = await client.put(
        "/api/editions/tiers-update", json={"organizations": [ids["mid"], ids["zeta"]]}, headers=ADMIN_HEADERS
    )
    assert dropped.status_code == 200
    readded = await client.put(
        "/api/editions/tiers-update",
        json={"organizations": [ids["mid"], ids["zeta"], ids["alpha"]]},
        headers=ADMIN_HEADERS,
    )
    assert [(s["name"], s["sponsor_tier"]) for s in readded.json()["sponsors"]] == [
        ("Zeta", "partner"),
        ("Mid", None),
        ("Alpha", None),
    ]

    # An explicit mapping replaces all levels; an empty one clears them.
    retiered = await client.put(
        "/api/editions/tiers-update", json={"sponsor_tiers": {ids["mid"]: "main"}}, headers=ADMIN_HEADERS
    )
    assert [(s["name"], s["sponsor_tier"]) for s in retiered.json()["sponsors"]] == [
        ("Mid", "main"),
        ("Zeta", None),
        ("Alpha", None),
    ]
    cleared = await client.put("/api/editions/tiers-update", json={"sponsor_tiers": {}}, headers=ADMIN_HEADERS)
    assert all(s["sponsor_tier"] is None for s in cleared.json()["sponsors"])


@pytest.mark.anyio
async def test_moving_off_festival_clears_the_levels(client):
    venue_id = await _venue(client)
    ids = await _lineup(client)
    await client.post(
        "/api/editions",
        json={
            "id": "tiers-bourse",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "organizations": [ids["alpha"]],
            "sponsor_tiers": {ids["alpha"]: "main"},
        },
        headers=ADMIN_HEADERS,
    )
    converted = await client.put("/api/editions/tiers-bourse", json={"edition_type": "bourse"}, headers=ADMIN_HEADERS)
    assert converted.status_code == 200
    assert converted.json()["organizations"] == []
    back = await client.put(
        "/api/editions/tiers-bourse",
        json={"edition_type": "festival", "organizations": [ids["alpha"]]},
        headers=ADMIN_HEADERS,
    )
    assert back.json()["sponsors"][0]["sponsor_tier"] is None


@pytest.mark.anyio
async def test_deleting_a_sponsor_drops_its_level(client):
    venue_id = await _venue(client)
    ids = await _lineup(client)
    await client.post(
        "/api/editions",
        json={
            "id": "tiers-delete",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "organizations": [ids["alpha"], ids["zeta"]],
            "sponsor_tiers": {ids["alpha"]: "main", ids["zeta"]: "partner"},
        },
        headers=ADMIN_HEADERS,
    )
    deleted = await client.delete(f"/api/organizations/{ids['alpha']}", headers=ADMIN_HEADERS)
    assert deleted.status_code == 204, deleted.text
    edition = (await client.get("/api/editions/tiers-delete", headers=ADMIN_HEADERS)).json()
    assert edition["organizations"] == [ids["zeta"]]
    assert [(s["name"], s["sponsor_tier"]) for s in edition["sponsors"]] == [("Zeta", "partner")]
