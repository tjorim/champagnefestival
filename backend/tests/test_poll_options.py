"""Meal options of a ``meals`` poll question: labels, dietary tags, order and deleting (admin REST)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event
from tests.poll_helpers import PAST, Volunteers, create_option, create_question, picks


async def _labels(client, **params) -> list[str]:
    r = await client.get("/api/poll-options", params=params, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    return [o["label"] for o in r.json()]


@pytest.mark.anyio
async def test_options_belong_to_a_meals_question_and_are_listed_per_question_or_edition(client):
    edition_id = (await _create_event(client, edition_id="edition-po-crud"))["edition_id"]
    lunch = await create_question(client, edition_id, "meals", "Lunch")
    dinner = await create_question(client, edition_id, "meals", "Diner")
    soup = await create_option(client, lunch["id"], "Soep")
    stew = await create_option(client, dinner["id"], "Stoofvlees")

    assert (soup["question_id"], soup["edition_id"], soup["sort_order"]) == (lunch["id"], edition_id, 0)
    assert await _labels(client, question_id=lunch["id"]) == ["Soep"]
    assert sorted(await _labels(client, edition_id=edition_id)) == ["Soep", "Stoofvlees"]

    r = await client.put(
        f"/api/poll-options/{stew['id']}", json={"label_nl": "Stoofvlees met puree"}, headers=ADMIN_HEADERS
    )
    assert r.json()["label"] == "Stoofvlees met puree"
    assert (await client.delete(f"/api/poll-options/{soup['id']}", headers=ADMIN_HEADERS)).status_code == 204
    assert await _labels(client, question_id=lunch["id"]) == []


@pytest.mark.anyio
async def test_a_yes_no_question_has_no_options(client):
    edition_id = (await _create_event(client, edition_id="edition-po-yes-no"))["edition_id"]
    dinner = await create_question(client, edition_id, "yes_no", "Eten op zondag")

    r = await client.post(
        "/api/poll-options", json={"question_id": dinner["id"], "label_nl": "Soep"}, headers=ADMIN_HEADERS
    )
    assert (r.status_code, r.json()["code"]) == (422, "poll_question_not_meals")
    missing = await client.post(
        "/api/poll-options", json={"question_id": "nope", "label_nl": "Soep"}, headers=ADMIN_HEADERS
    )
    assert (missing.status_code, missing.json()["code"]) == (404, "poll_question_not_found")


@pytest.mark.anyio
async def test_labels_are_translated_with_dutch_required_and_tags_are_validated(client):
    edition_id = (await _create_event(client, edition_id="edition-po-i18n"))["edition_id"]
    meals = await create_question(client, edition_id)
    stew = await create_option(
        client, meals["id"], "Stoofvlees", label_fr="Carbonade", label_en="Beef stew", dietary_tags=["lactose_free"]
    )
    await create_option(client, meals["id"], "Soep")

    assert (stew["label"], stew["label_fr"], stew["label_en"], stew["dietary_tags"]) == (
        "Stoofvlees",
        "Carbonade",
        "Beef stew",
        ["lactose_free"],
    )
    assert await _labels(client, question_id=meals["id"], locale="fr") == ["Carbonade", "Soep"]  # no French soup

    for payload in (
        {"label_fr": "Seulement"},  # no Dutch label
        {"label_nl": "  "},
        {"label_nl": "Soep", "dietary_tags": ["halal"]},
        {"label_nl": "Soep", "dietary_tags": ["vegan", "vegan"]},
        {"label_nl": "Soep", "label_language": "nl"},
        {"label_nl": "Soep", "edition_id": edition_id},
    ):
        r = await client.post("/api/poll-options", json={"question_id": meals["id"], **payload}, headers=ADMIN_HEADERS)
        assert r.status_code == 422, payload


@pytest.mark.anyio
async def test_update_merges_translations_and_replaces_tags(client):
    edition_id = (await _create_event(client, edition_id="edition-po-merge"))["edition_id"]
    meals = await create_question(client, edition_id)
    option = await create_option(client, meals["id"], "Stoofvlees", label_en="Beef stew", dietary_tags=["vegan"])
    url = f"/api/poll-options/{option['id']}"

    r = await client.put(url, json={"label_fr": "Carbonade"}, headers=ADMIN_HEADERS)
    assert (r.json()["label_nl"], r.json()["label_fr"], r.json()["label_en"]) == (
        "Stoofvlees",
        "Carbonade",
        "Beef stew",
    )
    assert r.json()["dietary_tags"] == ["vegan"]  # untouched
    r = await client.put(
        url, json={"label_en": "", "dietary_tags": ["vegetarian", "gluten_free"]}, headers=ADMIN_HEADERS
    )
    assert (r.json()["label_en"], r.json()["dietary_tags"]) == (None, ["vegetarian", "gluten_free"])
    assert (await client.put(url, json={"dietary_tags": []}, headers=ADMIN_HEADERS)).json()["dietary_tags"] == []

    r = await client.put(url, json={"label_nl": ""}, headers=ADMIN_HEADERS)
    assert (r.status_code, r.json()["code"]) == (422, "poll_option_invalid")
    assert (
        await client.put("/api/poll-options/nope", json={"label_en": "x"}, headers=ADMIN_HEADERS)
    ).status_code == 404


@pytest.mark.anyio
async def test_options_are_reordered_within_their_question(client):
    edition_id = (await _create_event(client, edition_id="edition-po-order"))["edition_id"]
    meals = await create_question(client, edition_id)
    other = await create_question(client, edition_id, "meals", "Diner")
    first = await create_option(client, meals["id"], "Een")
    second = await create_option(client, meals["id"], "Twee")
    third = await create_option(client, meals["id"], "Drie")
    elsewhere = await create_option(client, other["id"], "Elders")
    assert [o["sort_order"] for o in (first, second, third, elsewhere)] == [0, 1, 2, 0]  # numbered per question

    r = await client.post(
        "/api/poll-options/reorder",
        json={"question_id": meals["id"], "ordered_ids": [third["id"], first["id"], second["id"]]},
        headers=ADMIN_HEADERS,
    )
    assert [o["label"] for o in r.json()] == ["Drie", "Een", "Twee"]
    assert (await create_option(client, meals["id"], "Vier"))["sort_order"] == 3

    for ordered in ([first["id"]], [first["id"], first["id"], second["id"], third["id"], "x"], [elsewhere["id"]]):
        r = await client.post(
            "/api/poll-options/reorder",
            json={"question_id": meals["id"], "ordered_ids": ordered},
            headers=ADMIN_HEADERS,
        )
        assert (r.status_code, r.json()["code"]) == (400, "poll_option_invalid_order"), ordered
    missing = await client.post(
        "/api/poll-options/reorder", json={"question_id": "nope", "ordered_ids": ["x"]}, headers=ADMIN_HEADERS
    )
    assert missing.status_code == 404


@pytest.mark.anyio
async def test_deleting_an_option_volunteers_picked_needs_confirmation_and_not_after_closing(
    client, volunteer_client_as, db_session
):
    from sqlalchemy import select

    from app.models import AuditEntry, VolunteerPollSelection

    edition_id = (await _create_event(client, edition_id="edition-po-delete"))["edition_id"]
    meals = await create_question(client, edition_id)
    soup = await create_option(client, meals["id"], "Soep")
    unused = await create_option(client, meals["id"], "Dessert")
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-po-delete")
    picked = await volunteers.call(
        "subject-po-delete", "put", f"/api/me/volunteer/poll/questions/{meals['id']}", json=picks((soup, 3))
    )
    assert picked.status_code == 200, picked.text

    assert (await client.delete(f"/api/poll-options/{unused['id']}", headers=ADMIN_HEADERS)).status_code == 204
    refused = await client.delete(f"/api/poll-options/{soup['id']}", headers=ADMIN_HEADERS)
    assert (refused.status_code, refused.json()["code"]) == (409, "poll_option_in_use")
    assert "1 volunteer" in refused.json()["detail"] and "3 in total" in refused.json()["detail"]

    await client.put(f"/api/poll-questions/{meals['id']}", json={"closes_at": PAST}, headers=ADMIN_HEADERS)
    closed = await client.delete(
        f"/api/poll-options/{soup['id']}", params={"confirm_selections": "true"}, headers=ADMIN_HEADERS
    )
    assert (closed.status_code, closed.json()["code"]) == (409, "poll_question_closed")
    await client.put(f"/api/poll-questions/{meals['id']}", json={"closes_at": None}, headers=ADMIN_HEADERS)

    done = await client.delete(
        f"/api/poll-options/{soup['id']}", params={"confirm_selections": "true"}, headers=ADMIN_HEADERS
    )
    assert done.status_code == 204
    assert (await db_session.execute(select(VolunteerPollSelection))).scalars().all() == []
    entry = (
        await db_session.execute(
            select(AuditEntry).where(AuditEntry.action == "poll_option_deleted", AuditEntry.resource_id == soup["id"])
        )
    ).scalar_one()
    assert [pick["quantity"] for pick in entry.details["removed_picks"]] == [3]


@pytest.mark.anyio
async def test_option_endpoints_are_admin_only(unauth_client, forbidden_client):
    for client in (unauth_client, forbidden_client):
        assert (await client.get("/api/poll-options")).status_code in (401, 403)
        assert (await client.post("/api/poll-options", json={"question_id": "q", "label_nl": "x"})).status_code in (
            401,
            403,
        )
        assert (await client.delete("/api/poll-options/x")).status_code in (401, 403)
