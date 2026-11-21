"""Poll questions: kinds, translated texts, closing, order, copying and deleting (admin REST)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditEntry
from tests.helpers import ADMIN_HEADERS, _create_event
from tests.poll_helpers import FUTURE, PAST, Volunteers, create_option, create_question, picks, questions


@pytest.mark.anyio
async def test_a_meals_and_a_yes_no_question_with_translated_texts(client):
    edition_id = (await _create_event(client, edition_id="edition-pq-create"))["edition_id"]
    dinner = await create_question(
        client,
        edition_id,
        "yes_no",
        "Eet je mee op zondag?",
        title_en="Join us for dinner on Sunday?",
        description_nl="Zondag 12 oktober, 18u",
        description_en="Sunday 12 October, 6 pm",
        closes_at=FUTURE,
    )
    meals = await create_question(client, edition_id, "meals", "Maaltijden", title_fr="Repas")

    assert (dinner["kind"], dinner["title"], dinner["title_en"], dinner["closed"]) == (
        "yes_no",
        "Eet je mee op zondag?",
        "Join us for dinner on Sunday?",
        False,
    )
    assert (dinner["sort_order"], meals["sort_order"]) == (0, 1)
    assert dinner["options"] == [] and dinner["yes_count"] == 0

    assert [q["title"] for q in await questions(client, edition_id)] == ["Eet je mee op zondag?", "Maaltijden"]
    assert [q["title"] for q in await questions(client, edition_id, locale="en")] == [
        "Join us for dinner on Sunday?",
        "Maaltijden",  # no English title: Dutch
    ]
    english = (await questions(client, edition_id, locale="en"))[0]
    assert english["description"] == "Sunday 12 October, 6 pm"

    soup = await create_option(client, meals["id"], "Soep")
    listed = await questions(client, edition_id)
    assert [o["label"] for o in listed[1]["options"]] == ["Soep"]
    assert listed[1]["options"][0]["id"] == soup["id"]


@pytest.mark.anyio
async def test_question_validation(client):
    edition_id = (await _create_event(client, edition_id="edition-pq-invalid"))["edition_id"]
    base = {"edition_id": edition_id, "kind": "yes_no", "title_nl": "Eet je mee?"}
    for override in (
        {"kind": "survey"},
        {"title_nl": "  "},
        {"title_nl": None, "title_en": "Only English"},
        {"description_en": "English description only"},
        {"closes_at": "2030-01-01T10:00:00"},  # no timezone
        {"title_language": "nl"},
        {"edition_id": "nope"},
    ):
        r = await client.post("/api/poll-questions", json={**base, **override}, headers=ADMIN_HEADERS)
        assert r.status_code in (404, 422), override
    assert (
        await client.get("/api/poll-questions", params={"edition_id": "nope"}, headers=ADMIN_HEADERS)
    ).status_code == 404


@pytest.mark.anyio
async def test_update_merges_texts_and_closes_or_reopens_one_question(client):
    edition_id = (await _create_event(client, edition_id="edition-pq-update"))["edition_id"]
    play = await create_question(client, edition_id, "yes_no", "Ga je mee naar het toneel?", title_fr="Vous venez ?")
    dinner = await create_question(client, edition_id, "yes_no", "Eten op zondag")
    url = f"/api/poll-questions/{play['id']}"

    r = await client.put(url, json={"title_en": "Join the play?"}, headers=ADMIN_HEADERS)
    assert (r.json()["title_nl"], r.json()["title_fr"], r.json()["title_en"]) == (
        "Ga je mee naar het toneel?",
        "Vous venez ?",
        "Join the play?",
    )
    assert (await client.put(url, json={"title_fr": ""}, headers=ADMIN_HEADERS)).json()["title_fr"] is None

    # Closing and reopening apply to this question only.
    r = await client.put(url, json={"closes_at": PAST}, headers=ADMIN_HEADERS)
    assert (r.json()["closed"], r.json()["closes_at"] is not None) == (True, True)
    other = [q for q in await questions(client, edition_id) if q["id"] == dinner["id"]][0]
    assert other["closed"] is False
    r = await client.put(url, json={"closes_at": FUTURE}, headers=ADMIN_HEADERS)
    assert r.json()["closed"] is False
    r = await client.put(url, json={"closes_at": None}, headers=ADMIN_HEADERS)
    assert r.json()["closes_at"] is None
    assert (await client.put(url, json={"title_en": "x"}, headers=ADMIN_HEADERS)).json()["closes_at"] is None  # kept

    for bad in ({"title_nl": ""}, {"kind": "meals"}, {"closes_at": "2030-01-01T10:00:00"}, {"description_fr": "Seul"}):
        r = await client.put(url, json=bad, headers=ADMIN_HEADERS)
        assert r.status_code == 422, bad
    assert (
        await client.put("/api/poll-questions/nope", json={"title_en": "x"}, headers=ADMIN_HEADERS)
    ).status_code == 404


@pytest.mark.anyio
async def test_questions_are_reordered(client):
    edition_id = (await _create_event(client, edition_id="edition-pq-order"))["edition_id"]
    first = await create_question(client, edition_id, "yes_no", "Een")
    second = await create_question(client, edition_id, "meals", "Twee")
    third = await create_question(client, edition_id, "yes_no", "Drie")

    r = await client.post(
        "/api/poll-questions/reorder",
        json={"edition_id": edition_id, "ordered_ids": [third["id"], first["id"], second["id"]]},
        headers=ADMIN_HEADERS,
    )
    assert [q["title"] for q in r.json()] == ["Drie", "Een", "Twee"]
    for ordered in ([first["id"]], [first["id"], first["id"], second["id"], third["id"]], ["nope"]):
        r = await client.post(
            "/api/poll-questions/reorder",
            json={"edition_id": edition_id, "ordered_ids": ordered},
            headers=ADMIN_HEADERS,
        )
        assert (r.status_code, r.json()["code"]) == (400, "poll_question_invalid_order")
    fourth = await create_question(client, edition_id, "yes_no", "Vier")
    assert fourth["sort_order"] == 3


@pytest.mark.anyio
async def test_copy_adds_questions_with_their_options_once(client):
    source = (await _create_event(client, edition_id="edition-pq-source"))["edition_id"]
    target = (await _create_event(client, edition_id="edition-pq-target"))["edition_id"]
    meals = await create_question(client, source, "meals", "Maaltijden", closes_at=FUTURE)
    await create_option(client, meals["id"], "Stoofvlees", label_en="Beef stew", dietary_tags=["lactose_free"])
    await create_question(client, source, "yes_no", "Eten op zondag")
    await create_question(client, target, "yes_no", "eten OP zondag")  # same kind and title, case-insensitive

    body = {"from_edition_id": source, "to_edition_id": target}
    r = await client.post("/api/poll-questions/copy", json=body, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    created = r.json()
    assert [q["title"] for q in created] == ["Maaltijden"]
    assert created[0]["closes_at"] is None  # closing times are not copied
    assert [(o["label_nl"], o["label_en"], o["dietary_tags"]) for o in created[0]["options"]] == [
        ("Stoofvlees", "Beef stew", ["lactose_free"])
    ]
    assert created[0]["options"][0]["id"] != meals["id"]
    assert created[0]["options"][0]["question_id"] == created[0]["id"]

    again = await client.post("/api/poll-questions/copy", json=body, headers=ADMIN_HEADERS)
    assert again.json() == []
    assert [q["title"] for q in await questions(client, target)] == ["eten OP zondag", "Maaltijden"]

    assert (
        await client.post("/api/poll-questions/copy", json={**body, "to_edition_id": source}, headers=ADMIN_HEADERS)
    ).status_code == 422
    for unknown in ({"from_edition_id": "nope"}, {"to_edition_id": "nope"}):
        r = await client.post("/api/poll-questions/copy", json={**body, **unknown}, headers=ADMIN_HEADERS)
        assert r.status_code == 404, unknown


@pytest.mark.anyio
async def test_deleting_an_answered_question_needs_confirmation_and_not_after_closing(
    client, volunteer_client_as, db_session
):
    edition_id = (await _create_event(client, edition_id="edition-pq-delete"))["edition_id"]
    dinner = await create_question(client, edition_id, "yes_no", "Eten op zondag")
    unused = await create_question(client, edition_id, "yes_no", "Toneel")
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-pq-delete")
    answered = await volunteers.call(
        "subject-pq-delete",
        "put",
        f"/api/me/volunteer/poll/questions/{dinner['id']}",
        json={"attending": True, "people": 2},
    )
    assert answered.status_code == 200, answered.text

    assert (await client.delete(f"/api/poll-questions/{unused['id']}", headers=ADMIN_HEADERS)).status_code == 204
    refused = await client.delete(f"/api/poll-questions/{dinner['id']}", headers=ADMIN_HEADERS)
    assert (refused.status_code, refused.json()["code"]) == (409, "poll_question_in_use")
    assert "1 volunteer" in refused.json()["detail"]

    await client.put(f"/api/poll-questions/{dinner['id']}", json={"closes_at": PAST}, headers=ADMIN_HEADERS)
    closed = await client.delete(
        f"/api/poll-questions/{dinner['id']}", params={"confirm_answers": "true"}, headers=ADMIN_HEADERS
    )
    assert (closed.status_code, closed.json()["code"]) == (409, "poll_question_closed")
    await client.put(f"/api/poll-questions/{dinner['id']}", json={"closes_at": None}, headers=ADMIN_HEADERS)

    done = await client.delete(
        f"/api/poll-questions/{dinner['id']}", params={"confirm_answers": "true"}, headers=ADMIN_HEADERS
    )
    assert done.status_code == 204
    assert await questions(client, edition_id) == []
    entry = (
        await db_session.execute(
            select(AuditEntry).where(
                AuditEntry.action == "poll_question_deleted", AuditEntry.resource_id == dinner["id"]
            )
        )
    ).scalar_one()
    assert entry.details["removed_answers"] == 1


@pytest.mark.anyio
async def test_deleting_a_meals_question_removes_its_options_and_picks(client, volunteer_client_as, db_session):
    edition_id = (await _create_event(client, edition_id="edition-pq-delete-meals"))["edition_id"]
    meals = await create_question(client, edition_id, "meals", "Maaltijden")
    soup = await create_option(client, meals["id"], "Soep")
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-pq-delete-meals")
    r = await volunteers.call(
        "subject-pq-delete-meals", "put", f"/api/me/volunteer/poll/questions/{meals['id']}", json=picks((soup, 2))
    )
    assert r.status_code == 200, r.text

    done = await client.delete(
        f"/api/poll-questions/{meals['id']}", params={"confirm_answers": "true"}, headers=ADMIN_HEADERS
    )
    assert done.status_code == 204
    assert (
        await client.get("/api/poll-options", params={"edition_id": edition_id}, headers=ADMIN_HEADERS)
    ).json() == []


@pytest.mark.anyio
async def test_question_endpoints_are_admin_only(unauth_client, forbidden_client):
    calls = [
        ("get", "/api/poll-questions?edition_id=x", None),
        ("post", "/api/poll-questions", {"edition_id": "x", "kind": "yes_no", "title_nl": "x"}),
        ("put", "/api/poll-questions/q", {"title_en": "x"}),
        ("delete", "/api/poll-questions/q", None),
        ("post", "/api/poll-questions/reorder", {"edition_id": "x", "ordered_ids": ["a"]}),
        ("post", "/api/poll-questions/copy", {"from_edition_id": "x", "to_edition_id": "y"}),
        ("get", "/api/poll-questions/orders?edition_id=x", None),
        ("put", "/api/poll-questions/orders/p?edition_id=x", {}),
    ]
    for client in (unauth_client, forbidden_client):
        for method, url, body in calls:
            r = await getattr(client, method)(url, **({"json": body} if body else {}))
            assert r.status_code in (401, 403), (method, url)
