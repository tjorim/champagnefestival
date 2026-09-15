"""Integration tests for edition-scoped volunteer meal/dinner poll options
and the /api/me/volunteer/poll-* self-service endpoints."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event

NISS_A = "91010112319"
EID_A = "123456789002"
NISS_B = "91010112418"
EID_B = "123456789103"


async def _create_option(client, *, edition_id: str, kind: str, label: str) -> dict:
    r = await client.post(
        "/api/poll-options",
        json={"edition_id": edition_id, "kind": kind, "label": label},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _register(vclient, *, name="Sofie De Smet", niss=NISS_A, eid=EID_A):
    return await vclient.post(
        "/api/me/volunteer/register",
        json={"name": name, "national_register_number": niss, "eid_document_number": eid},
    )


@pytest.mark.anyio
async def test_admin_creates_lists_updates_and_deletes_poll_options(client):
    event = await _create_event(client, edition_id="edition-poll-crud")
    edition_id = event["edition_id"]

    dish = await _create_option(client, edition_id=edition_id, kind="dish", label="Vol-au-vent met puree")
    soup = await _create_option(client, edition_id=edition_id, kind="soup", label="Tomatensoep met balletjes")

    r = await client.get("/api/poll-options", params={"edition_id": edition_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    labels = {o["label"] for o in r.json()}
    assert labels == {"Vol-au-vent met puree", "Tomatensoep met balletjes"}

    r = await client.put(
        f"/api/poll-options/{dish['id']}", json={"label": "Stoofvlees met puree"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200, r.text
    assert r.json()["label"] == "Stoofvlees met puree"

    r = await client.delete(f"/api/poll-options/{soup['id']}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/poll-options", params={"edition_id": edition_id}, headers=ADMIN_HEADERS)
    assert [o["id"] for o in r.json()] == [dish["id"]]


@pytest.mark.anyio
async def test_create_poll_option_rejects_unknown_edition(client):
    r = await client.post(
        "/api/poll-options",
        json={"edition_id": "no-such-edition", "kind": "dish", "label": "Whatever"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_poll_options_rejects_unauthenticated(unauth_client):
    r = await unauth_client.get("/api/poll-options")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_poll_options_rejects_non_admin(forbidden_client):
    r = await forbidden_client.get("/api/poll-options")
    assert r.status_code == 403


@pytest.mark.anyio
async def test_volunteer_poll_options_empty_without_active_edition(volunteer_client_as):
    async with volunteer_client_as() as vclient:
        r = await vclient.get("/api/me/volunteer/poll-options")
        assert r.status_code == 200, r.text
        assert r.json() == {
            "edition_id": None,
            "options": [],
            "selections": {"dish_option_id": None, "soup_option_id": None, "dinner_option_ids": []},
        }


@pytest.mark.anyio
async def test_volunteer_replaces_own_poll_selections(client, volunteer_client_as):
    event = await _create_event(client, edition_id="edition-poll-self")
    edition_id = event["edition_id"]
    dish = await _create_option(client, edition_id=edition_id, kind="dish", label="Vispannetje")
    soup = await _create_option(client, edition_id=edition_id, kind="soup", label="Pompoensoep")
    thursday = await _create_option(client, edition_id=edition_id, kind="dinner", label="Donderdag - Cardis")
    sunday = await _create_option(client, edition_id=edition_id, kind="dinner", label="Zondag - Hippo")

    async with volunteer_client_as("subject-poll-a") as vclient:
        r = await _register(vclient)
        assert r.status_code == 200, r.text

        r = await vclient.get("/api/me/volunteer/poll-options")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["edition_id"] == edition_id
        assert {o["id"] for o in body["options"]} == {dish["id"], soup["id"], thursday["id"], sunday["id"]}
        assert body["selections"] == {"dish_option_id": None, "soup_option_id": None, "dinner_option_ids": []}

        r = await vclient.put(
            "/api/me/volunteer/poll-selections",
            json={
                "dish_option_id": dish["id"],
                "soup_option_id": soup["id"],
                "dinner_option_ids": [thursday["id"], sunday["id"]],
            },
        )
        assert r.status_code == 200, r.text
        selections = r.json()["selections"]
        assert selections["dish_option_id"] == dish["id"]
        assert selections["soup_option_id"] == soup["id"]
        assert sorted(selections["dinner_option_ids"]) == sorted([thursday["id"], sunday["id"]])

        # A second replace fully supersedes the first, including dropping a dinner.
        r = await vclient.put(
            "/api/me/volunteer/poll-selections",
            json={"dish_option_id": dish["id"], "soup_option_id": None, "dinner_option_ids": [thursday["id"]]},
        )
        assert r.status_code == 200, r.text
        selections = r.json()["selections"]
        assert selections["dish_option_id"] == dish["id"]
        assert selections["soup_option_id"] is None
        assert selections["dinner_option_ids"] == [thursday["id"]]

        r = await vclient.get("/api/me/volunteer/poll-options")
        assert r.json()["selections"] == selections


@pytest.mark.anyio
async def test_volunteer_poll_selection_rejects_mismatched_kind(client, volunteer_client_as):
    event = await _create_event(client, edition_id="edition-poll-kind")
    edition_id = event["edition_id"]
    soup = await _create_option(client, edition_id=edition_id, kind="soup", label="Kippensoep met vermicelli")

    async with volunteer_client_as("subject-poll-kind") as vclient:
        assert (await _register(vclient)).status_code == 200

        r = await vclient.put("/api/me/volunteer/poll-selections", json={"dish_option_id": soup["id"]})
        assert r.status_code == 400
        assert "dish" in r.json()["detail"]


@pytest.mark.anyio
async def test_volunteer_poll_selection_rejects_option_not_in_active_edition(client, volunteer_client_as):
    stale_event = await _create_event(
        client, edition_id="edition-poll-stale", edition_active=False, title="Old Edition Event"
    )
    stale_dish = await _create_option(client, edition_id=stale_event["edition_id"], kind="dish", label="Old Dish")

    async with volunteer_client_as("subject-poll-stale") as vclient:
        assert (await _register(vclient)).status_code == 200

        r = await vclient.put("/api/me/volunteer/poll-selections", json={"dish_option_id": stale_dish["id"]})
        assert r.status_code == 404


@pytest.mark.anyio
async def test_volunteer_poll_selections_do_not_leak_between_volunteers(client, volunteer_client_as):
    event = await _create_event(client, edition_id="edition-poll-isolation")
    edition_id = event["edition_id"]
    dish_a = await _create_option(client, edition_id=edition_id, kind="dish", label="Escalope Milanese")
    dish_b = await _create_option(client, edition_id=edition_id, kind="dish", label="Hachis Parmentier")

    async with volunteer_client_as("subject-poll-x") as vclient_a:
        assert (await _register(vclient_a, niss=NISS_A, eid=EID_A)).status_code == 200
        r = await vclient_a.put("/api/me/volunteer/poll-selections", json={"dish_option_id": dish_a["id"]})
        assert r.status_code == 200, r.text

    async with volunteer_client_as("subject-poll-y") as vclient_b:
        assert (await _register(vclient_b, name="Rik Cooleman", niss=NISS_B, eid=EID_B)).status_code == 200
        r = await vclient_b.put("/api/me/volunteer/poll-selections", json={"dish_option_id": dish_b["id"]})
        assert r.status_code == 200, r.text

    async with volunteer_client_as("subject-poll-x") as vclient_a:
        r = await vclient_a.get("/api/me/volunteer/poll-options")
        assert r.json()["selections"]["dish_option_id"] == dish_a["id"]
