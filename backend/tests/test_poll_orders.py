"""Who answered what, and an admin entering or correcting a volunteer's answers (admin REST)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditEntry, Person
from tests.helpers import ADMIN_HEADERS, _create_event
from tests.poll_helpers import EID_A, EID_B, NISS_A, NISS_B, PAST, Volunteers, create_option, create_question, picks


async def _person_id(db_session, name: str) -> str:
    return (await db_session.execute(select(Person.id).where(Person.name == name))).scalar_one()


async def _setup(client, edition_id: str):
    dinner = await create_question(client, edition_id, "yes_no", "Eten op zondag?")
    meals = await create_question(client, edition_id, "meals", "Maaltijden", title_en="Meals")
    stew = await create_option(client, meals["id"], "Stoofvlees", label_en="Beef stew")
    soup = await create_option(client, meals["id"], "Soep", dietary_tags=["vegan"])
    return dinner, meals, stew, soup


@pytest.mark.anyio
async def test_orders_list_every_volunteer_with_their_answers_and_notes(client, volunteer_client_as, db_session):
    edition_id = (await _create_event(client, edition_id="edition-po-orders"))["edition_id"]
    dinner, meals, stew, soup = await _setup(client, edition_id)
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-orders-a", name="Sofie De Smet", niss=NISS_A, eid=EID_A)
    await volunteers.register("subject-orders-b", name="Rik Cooleman", niss=NISS_B, eid=EID_B)
    base = "/api/me/volunteer/poll"
    await volunteers.call(
        "subject-orders-a", "put", f"{base}/questions/{meals['id']}", json=picks((soup, 1), (stew, 2))
    )
    await volunteers.call(
        "subject-orders-a", "put", f"{base}/questions/{dinner['id']}", json={"attending": True, "people": 3}
    )
    await volunteers.call("subject-orders-a", "put", f"{base}/note", json={"note": "Geen noten"})
    await volunteers.call("subject-orders-b", "put", f"{base}/questions/{dinner['id']}", json={"attending": False})

    r = await client.get(
        "/api/poll-questions/orders", params={"edition_id": edition_id, "locale": "en"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200, r.text
    body = r.json()
    summary = {q["title"]: q for q in body["questions"]}
    assert [q["title"] for q in body["questions"]] == ["Eten op zondag?", "Meals"]
    assert (summary["Eten op zondag?"]["yes_count"], summary["Eten op zondag?"]["no_count"]) == (1, 1)
    assert (summary["Eten op zondag?"]["people_total"], summary["Eten op zondag?"]["answered_count"]) == (3, 2)
    assert summary["Meals"]["answered_count"] == 1
    assert [(o["label"], o["dietary_tags"]) for o in summary["Meals"]["options"]] == [
        ("Beef stew", []),
        ("Soep", ["vegan"]),
    ]

    assert body["volunteer_count"] == 2
    rows = {row["name"]: row for row in body["volunteers"]}
    assert [row["name"] for row in body["volunteers"]] == ["Rik Cooleman", "Sofie De Smet"]
    sofie, rik = rows["Sofie De Smet"], rows["Rik Cooleman"]
    assert sofie["answered_question_ids"] == [dinner["id"], meals["id"]]
    assert sofie["note"] == "Geen noten"
    assert [s["option_id"] for s in sofie["selections"]] == [stew["id"], soup["id"]]  # in option order
    assert sofie["attendance"] == [{"question_id": dinner["id"], "attending": True, "people": 3}]
    assert rik["answered_question_ids"] == [dinner["id"]]
    assert rik["attendance"] == [{"question_id": dinner["id"], "attending": False, "people": 0}]
    assert rik["selections"] == []
    assert (
        await client.get("/api/poll-questions/orders", params={"edition_id": "nope"}, headers=ADMIN_HEADERS)
    ).status_code == 404


@pytest.mark.anyio
async def test_admin_enters_and_corrects_a_volunteers_answers(client, volunteer_client_as, db_session):
    edition_id = (await _create_event(client, edition_id="edition-po-entry"))["edition_id"]
    dinner, meals, stew, soup = await _setup(client, edition_id)
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-entry", name="Sofie De Smet", niss=NISS_A, eid=EID_A)
    sofie = await _person_id(db_session, "Sofie De Smet")
    url = f"/api/poll-questions/orders/{sofie}"
    params = {"edition_id": edition_id}

    # A volunteer who has not answered yet: the admin registers what they emailed.
    r = await client.put(
        url,
        params=params,
        json={
            **picks((soup, 2), (stew, 1)),
            "attendance": [{"question_id": dinner["id"], "attending": True, "people": 2}],
            "note": "  Geen noten ",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json() == {
        "choices": [],
        "texts": [],
        "ratings": [],
        "volunteer_id": sofie,
        "name": "Sofie De Smet",
        "note": "Geen noten",
        "answered_question_ids": [dinner["id"], meals["id"]],
        "selections": [{"option_id": stew["id"], "quantity": 1}, {"option_id": soup["id"], "quantity": 2}],
        "attendance": [{"question_id": dinner["id"], "attending": True, "people": 2}],
    }
    own = (await volunteers.call("subject-entry", "get", "/api/me/volunteer/poll")).json()
    assert own["questions"][0]["attending"] is True and own["questions"][0]["people"] == 2
    assert own["questions"][1]["selections"] == r.json()["selections"] and own["note"] == "Geen noten"

    # A correction replaces everything; the note is kept when omitted and cleared with an empty string.
    r = await client.put(
        url,
        params=params,
        json={**picks((soup, 3)), "attendance": [{"question_id": dinner["id"], "attending": False}]},
        headers=ADMIN_HEADERS,
    )
    assert r.json()["selections"] == [{"option_id": soup["id"], "quantity": 3}]
    assert r.json()["attendance"] == [{"question_id": dinner["id"], "attending": False, "people": 0}]
    assert r.json()["note"] == "Geen noten"
    r = await client.put(url, params=params, json={"note": ""}, headers=ADMIN_HEADERS)
    assert (r.json()["answered_question_ids"], r.json()["selections"], r.json()["note"]) == ([], [], None)

    entry = (
        (
            await db_session.execute(
                select(AuditEntry)
                .where(AuditEntry.action == "volunteer_poll_answers_set_by_admin")
                .order_by(AuditEntry.timestamp.desc())
            )
        )
        .scalars()
        .first()
    )
    assert entry is not None and entry.resource_id == sofie
    assert (entry.details["edition_id"], entry.details["closed_questions_changed"]) == (edition_id, [])


@pytest.mark.anyio
async def test_changing_a_closed_question_needs_confirmation_but_other_changes_do_not(
    client, volunteer_client_as, db_session
):
    edition_id = (await _create_event(client, edition_id="edition-po-closed"))["edition_id"]
    dinner, meals, stew, soup = await _setup(client, edition_id)
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-closed", name="Sofie De Smet", niss=NISS_A, eid=EID_A)
    sofie = await _person_id(db_session, "Sofie De Smet")
    url = f"/api/poll-questions/orders/{sofie}"
    params = {"edition_id": edition_id}
    await client.put(f"/api/poll-questions/{dinner['id']}", json={"closes_at": PAST}, headers=ADMIN_HEADERS)

    # The meals question is open: no confirmation needed for it, and an unchanged closed question is fine.
    ok = await client.put(url, params=params, json=picks((soup, 1)), headers=ADMIN_HEADERS)
    assert ok.status_code == 200, ok.text

    changed = {**picks((soup, 1)), "attendance": [{"question_id": dinner["id"], "attending": True, "people": 2}]}
    refused = await client.put(url, params=params, json=changed, headers=ADMIN_HEADERS)
    assert (refused.status_code, refused.json()["code"]) == (409, "poll_question_closed")
    assert "confirm_closed" in refused.json()["detail"]

    done = await client.put(url, params=params, json={**changed, "confirm_closed": True}, headers=ADMIN_HEADERS)
    assert done.status_code == 200, done.text
    assert done.json()["attendance"] == [{"question_id": dinner["id"], "attending": True, "people": 2}]
    entry = (
        (
            await db_session.execute(
                select(AuditEntry)
                .where(AuditEntry.action == "volunteer_poll_answers_set_by_admin")
                .order_by(AuditEntry.timestamp.desc())
            )
        )
        .scalars()
        .first()
    )
    assert entry is not None and entry.details["closed_questions_changed"] == [dinner["id"]]

    # The same answer again changes nothing in the closed question, so it needs no confirmation.
    same = await client.put(url, params=params, json=changed, headers=ADMIN_HEADERS)
    assert same.status_code == 200, same.text
    # The volunteer still cannot change the closed question themselves.
    own = await volunteers.call(
        "subject-closed", "put", f"/api/me/volunteer/poll/questions/{dinner['id']}", json={"attending": False}
    )
    assert own.status_code == 409


@pytest.mark.anyio
async def test_admin_entry_validates_the_volunteer_and_the_answers(client, volunteer_client_as, db_session):
    edition_id = (await _create_event(client, edition_id="edition-po-invalid"))["edition_id"]
    dinner, meals, stew, soup = await _setup(client, edition_id)
    other_id = (await _create_event(client, edition_id="edition-po-invalid-other", edition_active=False))["edition_id"]
    elsewhere_meals = await create_question(client, other_id, "meals", "Elders")
    elsewhere = await create_option(client, elsewhere_meals["id"], "Elders")
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-invalid", name="Sofie De Smet", niss=NISS_A, eid=EID_A)
    sofie = await _person_id(db_session, "Sofie De Smet")
    db_session.add(Person(id="per-visitor", name="Not A Volunteer"))
    await db_session.commit()

    def put(volunteer: str, body: dict, **extra):
        return client.put(
            f"/api/poll-questions/orders/{volunteer}",
            params={"edition_id": edition_id, **extra},
            json=body,
            headers=ADMIN_HEADERS,
        )

    unknown_option = await put(sofie, {"selections": [{"option_id": "missing", "quantity": 1}]})
    assert (unknown_option.status_code, unknown_option.json()["code"]) == (404, "poll_option_not_found")
    other_edition = await put(sofie, picks((elsewhere, 1)))
    assert (other_edition.status_code, other_edition.json()["code"]) == (404, "poll_option_not_found")
    for attendance in (
        [{"question_id": meals["id"], "attending": True}],  # a meals question has no yes/no answer
        [{"question_id": "nope", "attending": True}],
    ):
        r = await put(sofie, {"attendance": attendance})
        assert (r.status_code, r.json()["code"]) == (404, "poll_question_not_found"), attendance
    for volunteer in ("nope", "per-visitor"):
        r = await put(volunteer, picks((soup, 1)))
        assert (r.status_code, r.json()["code"]) == (404, "volunteer_not_found")
    assert (await put(sofie, picks((soup, 1)), edition_id="nope")).status_code == 404
    for bad in (
        picks((soup, 21)),
        picks((soup, 1), (soup, 2)),
        {"attendance": [{"question_id": dinner["id"], "attending": True, "people": 11}]},
        {"attendance": [{"question_id": dinner["id"], "attending": True, "people": 0}]},
        {"attendance": [{"question_id": dinner["id"], "attending": True}] * 2},
        {"extra": 1},
    ):
        assert (await put(sofie, bad)).status_code == 422, bad
