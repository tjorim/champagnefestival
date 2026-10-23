"""The volunteer's own side of the poll: seeing the questions and answering yes/no and meals questions."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditEntry, VolunteerPollSelection
from tests.helpers import ADMIN_HEADERS, _create_event
from tests.poll_helpers import FUTURE, PAST, Volunteers, create_option, create_question, picks

POLL = "/api/me/volunteer/poll"


def answer_url(question: dict) -> str:
    return f"{POLL}/questions/{question['id']}"


@pytest.mark.anyio
async def test_the_view_is_empty_without_an_active_edition_and_before_linking(volunteer_client_as):
    async with volunteer_client_as("subject-vp-empty") as vclient:
        r = await vclient.get(POLL)
        assert r.status_code == 200, r.text
        assert r.json() == {"edition_id": None, "questions": [], "note": None}


@pytest.mark.anyio
async def test_a_volunteer_sees_questions_in_their_language_and_answers_both_kinds(
    client, volunteer_client_as, db_session
):
    edition_id = (await _create_event(client, edition_id="edition-vp-answer"))["edition_id"]
    dinner = await create_question(
        client, edition_id, "yes_no", "Eten op zondag?", title_en="Dinner on Sunday?", description_nl="18u"
    )
    meals = await create_question(client, edition_id, "meals", "Maaltijden")
    stew = await create_option(client, meals["id"], "Stoofvlees", label_en="Beef stew", dietary_tags=["lactose_free"])
    soup = await create_option(client, meals["id"], "Soep")
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-vp-answer")

    view = (await volunteers.call("subject-vp-answer", "get", POLL, params={"locale": "en"})).json()
    assert view["edition_id"] == edition_id
    assert [(q["kind"], q["title"]) for q in view["questions"]] == [
        ("yes_no", "Dinner on Sunday?"),
        ("meals", "Maaltijden"),
    ]
    assert view["questions"][0]["description"] == "18u"  # no English description: Dutch
    assert (view["questions"][0]["attending"], view["questions"][0]["people"]) == (None, 0)
    assert [(o["label"], o["dietary_tags"]) for o in view["questions"][1]["options"]] == [
        ("Beef stew", ["lactose_free"]),
        ("Soep", []),
    ]
    assert (await volunteers.call("subject-vp-answer", "get", POLL, params={"locale": "de"})).status_code == 422

    # Yes with three people, then a no.
    r = await volunteers.call("subject-vp-answer", "put", answer_url(dinner), json={"attending": True, "people": 3})
    assert r.status_code == 200, r.text
    assert (r.json()["questions"][0]["attending"], r.json()["questions"][0]["people"]) == (True, 3)
    r = await volunteers.call("subject-vp-answer", "put", answer_url(dinner), json={"attending": True})
    assert r.json()["questions"][0]["people"] == 1  # a yes without a number is one person
    r = await volunteers.call("subject-vp-answer", "put", answer_url(dinner), json={"attending": False})
    assert (r.json()["questions"][0]["attending"], r.json()["questions"][0]["people"]) == (False, 0)

    # Meals: several different ones, several of the same; a later save replaces the earlier picks.
    r = await volunteers.call("subject-vp-answer", "put", answer_url(meals), json=picks((stew, 1), (soup, 2)))
    assert r.json()["questions"][1]["selections"] == [
        {"option_id": stew["id"], "quantity": 1},
        {"option_id": soup["id"], "quantity": 2},
    ]
    r = await volunteers.call("subject-vp-answer", "put", answer_url(meals), json=picks((soup, 3)))
    assert r.json()["questions"][1]["selections"] == [{"option_id": soup["id"], "quantity": 3}]
    # The yes/no answer is untouched by saving the meals question.
    assert r.json()["questions"][0]["attending"] is False

    entry = (
        (
            await db_session.execute(
                select(AuditEntry)
                .where(AuditEntry.action == "volunteer_poll_answer_saved")
                .order_by(AuditEntry.timestamp.desc())
            )
        )
        .scalars()
        .first()
    )
    assert entry is not None and entry.details["kind"] == "meals"


@pytest.mark.anyio
async def test_answers_are_validated_against_the_question(client, volunteer_client_as, db_session):
    edition_id = (await _create_event(client, edition_id="edition-vp-invalid"))["edition_id"]
    dinner = await create_question(client, edition_id, "yes_no", "Eten op zondag?")
    meals = await create_question(client, edition_id, "meals", "Maaltijden")
    soup = await create_option(client, meals["id"], "Soep")
    other = await create_question(client, edition_id, "meals", "Diner")
    elsewhere = await create_option(client, other["id"], "Elders")
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-vp-invalid")

    async def put(url: str, body: dict):
        return await volunteers.call("subject-vp-invalid", "put", url, json=body)

    for url, body in (
        (answer_url(dinner), {}),  # no answer at all
        (answer_url(dinner), {"selections": []}),  # a meals answer for a yes/no question
        (answer_url(dinner), {"attending": True, "people": 11}),
        (answer_url(dinner), {"attending": True, "people": 0}),
        (answer_url(meals), {"attending": True}),  # a yes/no answer for a meals question
        (answer_url(meals), {}),
        (answer_url(meals), picks((soup, 21))),
        (answer_url(meals), picks((soup, 1), (soup, 2))),
    ):
        r = await put(url, body)
        assert r.status_code == 422, (url, body)
    wrong_kind = await put(answer_url(dinner), {"selections": []})
    assert wrong_kind.json()["code"] == "poll_answer_invalid"
    other_question = await put(answer_url(meals), picks((elsewhere, 1)))
    assert (other_question.status_code, other_question.json()["code"]) == (404, "poll_option_not_found")
    missing = await put(f"{POLL}/questions/nope", {"attending": True})
    assert (missing.status_code, missing.json()["code"]) == (404, "poll_question_not_found")


@pytest.mark.anyio
async def test_each_question_closes_on_its_own(client, volunteer_client_as, db_session):
    edition_id = (await _create_event(client, edition_id="edition-vp-close"))["edition_id"]
    dinner = await create_question(client, edition_id, "yes_no", "Eten op zondag?", closes_at=PAST)
    play = await create_question(client, edition_id, "yes_no", "Toneel in december?", closes_at=FUTURE)
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-vp-close")

    closed = await volunteers.call("subject-vp-close", "put", answer_url(dinner), json={"attending": True})
    assert (closed.status_code, closed.json()["code"]) == (409, "poll_question_closed")
    open_one = await volunteers.call("subject-vp-close", "put", answer_url(play), json={"attending": True, "people": 2})
    assert open_one.status_code == 200, open_one.text
    states = {q["title"]: q["closed"] for q in open_one.json()["questions"]}
    assert states == {"Eten op zondag?": True, "Toneel in december?": False}

    # Reopening the dinner lets the volunteer answer it.
    await client.put(f"/api/poll-questions/{dinner['id']}", json={"closes_at": None}, headers=ADMIN_HEADERS)
    again = await volunteers.call("subject-vp-close", "put", answer_url(dinner), json={"attending": False})
    assert again.status_code == 200, again.text


@pytest.mark.anyio
async def test_the_dietary_note_is_saved_kept_cleared_and_follows_the_meals_questions(
    client, volunteer_client_as, db_session
):
    edition_id = (await _create_event(client, edition_id="edition-vp-note"))["edition_id"]
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-vp-note")
    note_url = f"{POLL}/note"

    no_meals = await volunteers.call("subject-vp-note", "put", note_url, json={"note": "Geen noten"})
    assert (no_meals.status_code, no_meals.json()["code"]) == (404, "poll_question_not_found")

    meals = await create_question(client, edition_id, "meals", "Maaltijden")
    soup = await create_option(client, meals["id"], "Soep")
    r = await volunteers.call("subject-vp-note", "put", note_url, json={"note": "  Notenallergie  "})
    assert r.json()["note"] == "Notenallergie"
    # Saving picks keeps the note; an empty note clears it.
    r = await volunteers.call("subject-vp-note", "put", answer_url(meals), json=picks((soup, 1)))
    assert r.json()["note"] == "Notenallergie"
    assert (await volunteers.call("subject-vp-note", "put", note_url, json={"note": " "})).json()["note"] is None
    too_long = await volunteers.call("subject-vp-note", "put", note_url, json={"note": "x" * 501})
    assert too_long.status_code == 422

    await client.put(f"/api/poll-questions/{meals['id']}", json={"closes_at": PAST}, headers=ADMIN_HEADERS)
    closed = await volunteers.call("subject-vp-note", "put", note_url, json={"note": "Laat"})
    assert (closed.status_code, closed.json()["code"]) == (409, "poll_question_closed")


@pytest.mark.anyio
async def test_only_the_active_editions_questions_can_be_answered_and_picks_do_not_leak(
    client, volunteer_client_as, db_session
):
    old_event = await _create_event(client, edition_id="edition-vp-old", edition_active=False)
    old_meals = await create_question(client, old_event["edition_id"], "meals", "Oud")
    old_soup = await create_option(client, old_meals["id"], "Oude soep")
    active_id = (await _create_event(client, edition_id="edition-vp-active"))["edition_id"]
    meals = await create_question(client, active_id, "meals", "Maaltijden")
    soup = await create_option(client, meals["id"], "Soep")
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-vp-active")

    not_active = await volunteers.call("subject-vp-active", "put", answer_url(old_meals), json=picks((old_soup, 1)))
    assert (not_active.status_code, not_active.json()["code"]) == (404, "poll_question_not_found")

    # A pick from a past edition stays when the active edition's answers are saved.
    from app.models import Person

    volunteer = (await db_session.execute(select(Person.id).where(Person.name == "Sofie De Smet"))).scalar_one()
    db_session.add(VolunteerPollSelection(volunteer_id=volunteer, option_id=old_soup["id"], quantity=2))
    await db_session.commit()
    r = await volunteers.call("subject-vp-active", "put", answer_url(meals), json=picks((soup, 1)))
    assert r.status_code == 200, r.text
    remaining = (await db_session.execute(select(VolunteerPollSelection.option_id))).scalars().all()
    assert set(remaining) == {old_soup["id"], soup["id"]}
    assert [q["title"] for q in r.json()["questions"]] == ["Maaltijden"]  # the old edition's question is not shown


@pytest.mark.anyio
async def test_picks_do_not_leak_between_volunteers_and_add_up_for_the_admin(client, volunteer_client_as, db_session):
    edition_id = (await _create_event(client, edition_id="edition-vp-isolation"))["edition_id"]
    meals = await create_question(client, edition_id, "meals", "Maaltijden")
    dish_a = await create_option(client, meals["id"], "Escalope Milanese")
    dish_b = await create_option(client, meals["id"], "Hachis Parmentier")
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-vp-x")
    from tests.poll_helpers import EID_B, NISS_B

    await volunteers.register("subject-vp-y", name="Rik Cooleman", niss=NISS_B, eid=EID_B)
    await volunteers.call("subject-vp-x", "put", answer_url(meals), json=picks((dish_a, 2), (dish_b, 1)))
    y = await volunteers.call("subject-vp-y", "put", answer_url(meals), json=picks((dish_b, 3)))
    assert y.json()["questions"][0]["selections"] == [{"option_id": dish_b["id"], "quantity": 3}]
    x = (await volunteers.call("subject-vp-x", "get", POLL)).json()
    assert x["questions"][0]["selections"] == [
        {"option_id": dish_a["id"], "quantity": 2},
        {"option_id": dish_b["id"], "quantity": 1},
    ]

    options = (await client.get("/api/poll-options", params={"question_id": meals["id"]}, headers=ADMIN_HEADERS)).json()
    assert {o["label"]: (o["total_quantity"], o["volunteer_count"]) for o in options} == {
        "Escalope Milanese": (2, 1),
        "Hachis Parmentier": (4, 2),
    }
    listed = (await client.get("/api/poll-questions", params={"edition_id": edition_id}, headers=ADMIN_HEADERS)).json()
    assert listed[0]["answered_count"] == 2


@pytest.mark.anyio
async def test_an_unlinked_account_cannot_answer(client, volunteer_client_as):
    edition_id = (await _create_event(client, edition_id="edition-vp-unlinked"))["edition_id"]
    dinner = await create_question(client, edition_id, "yes_no", "Eten op zondag?")
    async with volunteer_client_as("subject-vp-unlinked") as vclient:
        view = await vclient.get(POLL)
        assert view.status_code == 200
        assert [q["title"] for q in view.json()["questions"]] == ["Eten op zondag?"]  # browsing is fine
        r = await vclient.put(answer_url(dinner), json={"attending": True})
        assert r.status_code == 404
