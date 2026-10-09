"""Integration tests for edition-scoped volunteer meal poll options and the
/api/me/volunteer/poll-* self-service endpoints (quantity per option)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event

NISS_A = "91010112319"
EID_A = "123456789002"
NISS_B = "91010112418"
EID_B = "123456789103"


async def _create_option(client, *, edition_id: str, label: str) -> dict:
    r = await client.post("/api/poll-options", json={"edition_id": edition_id, "label": label}, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    return r.json()


async def _register(vclient, *, name="Sofie De Smet", niss=NISS_A, eid=EID_A):
    return await vclient.post(
        "/api/me/volunteer/register",
        json={"name": name, "national_register_number": niss, "eid_document_number": eid},
    )


def _picks(*pairs: tuple[dict, int]) -> dict:
    return {"selections": [{"option_id": option["id"], "quantity": quantity} for option, quantity in pairs]}


@pytest.mark.anyio
async def test_admin_creates_lists_updates_and_deletes_poll_options(client):
    event = await _create_event(client, edition_id="edition-poll-crud")
    edition_id = event["edition_id"]

    dish = await _create_option(client, edition_id=edition_id, label="Vol-au-vent met puree")
    soup = await _create_option(client, edition_id=edition_id, label="Tomatensoep met balletjes")

    r = await client.get("/api/poll-options", params={"edition_id": edition_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert [o["label"] for o in r.json()] == ["Vol-au-vent met puree", "Tomatensoep met balletjes"]

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
async def test_poll_option_label_is_stripped_and_required(client):
    event = await _create_event(client, edition_id="edition-poll-strip")
    r = await client.post(
        "/api/poll-options",
        json={"edition_id": event["edition_id"], "label": "  Vol-au-vent  "},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    option_id = r.json()["id"]
    assert r.json()["label"] == "Vol-au-vent"

    for body in ({"label": "   "}, {"label": ""}, {"label_en": "Old shape"}, {}):
        r = await client.put(f"/api/poll-options/{option_id}", json=body, headers=ADMIN_HEADERS)
        assert r.status_code == 422, body
    r = await client.post(
        "/api/poll-options",
        json={"edition_id": event["edition_id"], "kind": "dish", "label": "Old shape"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422  # the kind is gone


@pytest.mark.anyio
async def test_create_poll_option_rejects_unknown_edition(client):
    r = await client.post(
        "/api/poll-options", json={"edition_id": "no-such-edition", "label": "Whatever"}, headers=ADMIN_HEADERS
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
        assert r.json() == {"edition_id": None, "options": [], "selections": []}


@pytest.mark.anyio
async def test_volunteer_replaces_own_quantities(client, volunteer_client_as):
    event = await _create_event(client, edition_id="edition-poll-self")
    edition_id = event["edition_id"]
    stew = await _create_option(client, edition_id=edition_id, label="Stoofvlees")
    vol_au_vent = await _create_option(client, edition_id=edition_id, label="Vol-au-vent")
    soup = await _create_option(client, edition_id=edition_id, label="Tomatensoep")

    async with volunteer_client_as("subject-poll-a") as vclient:
        assert (await _register(vclient)).status_code == 200

        r = await vclient.get("/api/me/volunteer/poll-options")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["edition_id"] == edition_id
        assert [(o["id"], o["label"]) for o in body["options"]] == [
            (stew["id"], "Stoofvlees"),
            (vol_au_vent["id"], "Vol-au-vent"),
            (soup["id"], "Tomatensoep"),
        ]
        assert body["selections"] == []

        # Several options at once, with quantities (two soups, a stew and a vol-au-vent).
        r = await vclient.put("/api/me/volunteer/poll-selections", json=_picks((stew, 1), (vol_au_vent, 1), (soup, 2)))
        assert r.status_code == 200, r.text
        assert r.json()["selections"] == [
            {"option_id": stew["id"], "quantity": 1},
            {"option_id": vol_au_vent["id"], "quantity": 1},
            {"option_id": soup["id"], "quantity": 2},
        ]

        # A second replace fully supersedes the first: an option left out means none of it.
        r = await vclient.put("/api/me/volunteer/poll-selections", json=_picks((soup, 3)))
        assert r.status_code == 200, r.text
        assert r.json()["selections"] == [{"option_id": soup["id"], "quantity": 3}]

        r = await vclient.put("/api/me/volunteer/poll-selections", json={"selections": []})
        assert r.json()["selections"] == []
        assert (await vclient.get("/api/me/volunteer/poll-options")).json()["selections"] == []


@pytest.mark.anyio
async def test_volunteer_quantities_are_validated(client, volunteer_client_as):
    event = await _create_event(client, edition_id="edition-poll-quantity")
    soup = await _create_option(client, edition_id=event["edition_id"], label="Tomatensoep")

    async with volunteer_client_as("subject-poll-quantity") as vclient:
        assert (await _register(vclient)).status_code == 200

        for quantity in (0, -1, 21):
            r = await vclient.put("/api/me/volunteer/poll-selections", json=_picks((soup, quantity)))
            assert r.status_code == 422, quantity
        assert (await vclient.put("/api/me/volunteer/poll-selections", json=_picks((soup, 20)))).status_code == 200

        twice = {"selections": [{"option_id": soup["id"], "quantity": 1}, {"option_id": soup["id"], "quantity": 2}]}
        assert (await vclient.put("/api/me/volunteer/poll-selections", json=twice)).status_code == 422
        blank = {"selections": [{"option_id": " ", "quantity": 1}]}
        assert (await vclient.put("/api/me/volunteer/poll-selections", json=blank)).status_code == 404
        old_shape = {"dish_option_id": soup["id"]}
        assert (await vclient.put("/api/me/volunteer/poll-selections", json=old_shape)).status_code == 422


@pytest.mark.anyio
async def test_volunteer_poll_selection_rejects_option_not_in_active_edition(client, volunteer_client_as):
    stale_event = await _create_event(
        client, edition_id="edition-poll-stale", edition_active=False, title="Old Edition Event"
    )
    stale_dish = await _create_option(client, edition_id=stale_event["edition_id"], label="Old Dish")

    async with volunteer_client_as("subject-poll-stale") as vclient:
        assert (await _register(vclient)).status_code == 200

        r = await vclient.put("/api/me/volunteer/poll-selections", json=_picks((stale_dish, 1)))
        assert r.status_code == 404


@pytest.mark.anyio
async def test_replacing_selections_preserves_a_past_editions_picks(client, volunteer_client_as, db_session):
    """Saving this edition's picks must never touch a volunteer's picks from
    a past edition — neither read them back as if they were current, nor
    delete them as a side effect of the full-replace."""
    from datetime import date as dt_date

    from sqlalchemy import select as sa_select
    from sqlalchemy import update as sa_update

    from app.models import Edition, EditionPollOption, Event, VolunteerPollSelection
    from app.utils import make_id

    old_event = await _create_event(client, edition_id="edition-poll-old", title="Old Edition Event")
    old_dish = await _create_option(client, edition_id=old_event["edition_id"], label="Old Dish")

    async with volunteer_client_as("subject-poll-cross-edition") as vclient:
        assert (await _register(vclient)).status_code == 200
        r = await vclient.put("/api/me/volunteer/poll-selections", json=_picks((old_dish, 2)))
        assert r.status_code == 200, r.text

    # A new active festival edition supersedes the old one, built directly
    # against the shared session rather than via the `client` fixture: a used
    # volunteer_client_as context clears the app's *entire*
    # dependency_overrides dict on exit, including `client`'s own — the two
    # fixtures can't be interleaved within one test.
    old_edition = await db_session.get(Edition, old_event["edition_id"])
    await db_session.execute(sa_update(Edition).where(Edition.id == old_edition.id).values(active=False))
    new_edition = Edition(
        id="edition-poll-new",
        year=old_edition.year,
        month=old_edition.month,
        venue_id=old_edition.venue_id,
        edition_type="festival",
        active=True,
    )
    db_session.add(new_edition)
    new_event = Event(
        id=make_id("evt"),
        edition_id=new_edition.id,
        title_language="nl",
        title_nl="New Edition Event",
        date=dt_date(2099, 3, 22),
        start_time="18:00",
        end_time="22:00",
        category="general",
        registration_required=True,
        active=True,
    )
    db_session.add(new_event)
    new_dish = EditionPollOption(id=make_id("opt"), edition_id=new_edition.id, label="New Dish")
    db_session.add(new_dish)
    await db_session.commit()

    async with volunteer_client_as("subject-poll-cross-edition") as vclient:
        r = await vclient.put(
            "/api/me/volunteer/poll-selections",
            json={"selections": [{"option_id": new_dish.id, "quantity": 1}]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["edition_id"] == new_edition.id
        assert r.json()["selections"] == [{"option_id": new_dish.id, "quantity": 1}]

        r = await vclient.get("/api/me/volunteer/poll-options")
        assert r.json()["selections"] == [{"option_id": new_dish.id, "quantity": 1}]

    rows = (await db_session.execute(sa_select(VolunteerPollSelection.option_id))).scalars().all()
    assert set(rows) == {old_dish["id"], new_dish.id}


@pytest.mark.anyio
async def test_volunteer_poll_selections_do_not_leak_between_volunteers_and_add_up_for_the_admin(
    client, volunteer_client_as, db_session
):
    event = await _create_event(client, edition_id="edition-poll-isolation")
    edition_id = event["edition_id"]
    dish_a = await _create_option(client, edition_id=edition_id, label="Escalope Milanese")
    dish_b = await _create_option(client, edition_id=edition_id, label="Hachis Parmentier")

    async with volunteer_client_as("subject-poll-x") as vclient_a:
        assert (await _register(vclient_a, niss=NISS_A, eid=EID_A)).status_code == 200
        r = await vclient_a.put("/api/me/volunteer/poll-selections", json=_picks((dish_a, 2), (dish_b, 1)))
        assert r.status_code == 200, r.text

    async with volunteer_client_as("subject-poll-y") as vclient_b:
        assert (await _register(vclient_b, name="Rik Cooleman", niss=NISS_B, eid=EID_B)).status_code == 200
        r = await vclient_b.put("/api/me/volunteer/poll-selections", json=_picks((dish_b, 3)))
        assert r.status_code == 200, r.text
        assert r.json()["selections"] == [{"option_id": dish_b["id"], "quantity": 3}]

    async with volunteer_client_as("subject-poll-x") as vclient_a:
        r = await vclient_a.get("/api/me/volunteer/poll-options")
        assert r.json()["selections"] == [
            {"option_id": dish_a["id"], "quantity": 2},
            {"option_id": dish_b["id"], "quantity": 1},
        ]

    # What to order from the caterer: the totals per option and how many people asked for it.
    from app.mcp.admin import poll_options as mcp_poll_options
    from tests.helpers import mcp_session_factory

    totals = {
        o["label"]: (o["total_quantity"], o["volunteer_count"])
        for o in await mcp_poll_options.list_poll_options(mcp_session_factory(db_session), edition_id)
    }
    assert totals == {"Escalope Milanese": (2, 1), "Hachis Parmentier": (4, 2)}
