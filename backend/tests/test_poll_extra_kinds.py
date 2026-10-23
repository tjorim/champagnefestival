"""All additional poll kinds use the same volunteer, admin and closing flows."""

import pytest
from sqlalchemy import select

from app.models import Person
from tests.helpers import ADMIN_HEADERS, _create_event
from tests.poll_helpers import PAST, Volunteers, create_option, create_question, questions


@pytest.mark.anyio
@pytest.mark.parametrize(
    "kind,field,collection,value,replacement",
    [
        ("single_choice", "option_id", "choices", None, None),
        ("free_text", "text", "texts", "  Een suggestie  ", "Een andere suggestie"),
        ("rating", "rating", "ratings", 1, 5),
    ],
)
async def test_full_answer_lifecycle(
    client, volunteer_client_as, db_session, kind, field, collection, value, replacement
):
    edition_id = (await _create_event(client, edition_id=f"edition-{kind}"))["edition_id"]
    question = await create_question(client, edition_id, kind, "Vraag", title_en="Question")
    if kind == "single_choice":
        option = await create_option(client, question["id"], "Eerste", label_en="First")
        second = await create_option(client, question["id"], "Tweede")
        value, replacement = option["id"], second["id"]
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-extra")
    person_id = (await db_session.execute(select(Person.id).where(Person.name == "Sofie De Smet"))).scalar_one()
    own_url = f"/api/me/volunteer/poll/questions/{question['id']}"
    admin_url = f"/api/poll-questions/orders/{person_id}?edition_id={edition_id}"
    view = await volunteers.call("subject-extra", "get", "/api/me/volunteer/poll", params={"locale": "en"})
    assert view.json()["questions"][0][field] is None
    assert view.json()["questions"][0]["title"] == "Question"
    for _ in range(2):
        result = await volunteers.call("subject-extra", "put", own_url, json={field: value})
        assert result.status_code == 200, result.text
        assert result.json()["questions"][0][field] == (value.strip() if isinstance(value, str) else value)
    listed = await questions(client, edition_id)
    assert listed[0]["answered_count"] == 1
    if kind == "single_choice":
        assert listed[0]["options"][0]["total_quantity"] == 1
        refused = await client.delete(f"/api/poll-options/{option['id']}", headers=ADMIN_HEADERS)
        assert (refused.status_code, refused.json()["code"]) == (409, "poll_option_in_use")
    orders = await client.get(f"/api/poll-questions/orders?edition_id={edition_id}", headers=ADMIN_HEADERS)
    assert orders.json()["volunteers"][0][collection] == [
        {"question_id": question["id"], field: value.strip() if isinstance(value, str) else value}
    ]
    # Clearing is explicit; omitting the answer field is invalid.
    assert (await volunteers.call("subject-extra", "put", own_url, json={})).status_code == 422
    cleared = await volunteers.call("subject-extra", "put", own_url, json={field: None})
    assert cleared.json()["questions"][0][field] is None
    assert (await questions(client, edition_id))[0]["answered_count"] == 0
    await volunteers.call("subject-extra", "put", own_url, json={field: value})
    await client.put(f"/api/poll-questions/{question['id']}", json={"closes_at": PAST}, headers=ADMIN_HEADERS)
    assert (await volunteers.call("subject-extra", "put", own_url, json={field: replacement})).status_code == 409
    payload = {collection: [{"question_id": question["id"], field: replacement}]}
    assert (await client.put(admin_url, json=payload, headers=ADMIN_HEADERS)).status_code == 409
    changed = await client.put(admin_url, json={**payload, "confirm_closed": True}, headers=ADMIN_HEADERS)
    assert changed.status_code == 200, changed.text
    assert changed.json()[collection] == payload[collection]
    assert (await client.put(admin_url, json=payload, headers=ADMIN_HEADERS)).status_code == 200
    if kind == "single_choice":
        refused = await client.delete(
            f"/api/poll-options/{second['id']}?confirm_selections=true", headers=ADMIN_HEADERS
        )
        assert (refused.status_code, refused.json()["code"]) == (409, "poll_question_closed")
    # Full replacement clears these answers too.
    cleared = await client.put(admin_url, json={"confirm_closed": True}, headers=ADMIN_HEADERS)
    assert cleared.json()[collection] == []
    assert (await questions(client, edition_id))[0]["answered_count"] == 0
    await client.put(f"/api/poll-questions/{question['id']}", json={"closes_at": None}, headers=ADMIN_HEADERS)
    await volunteers.call("subject-extra", "put", own_url, json={field: replacement})
    if kind == "single_choice":
        deleted = await client.delete(
            f"/api/poll-options/{second['id']}?confirm_selections=true", headers=ADMIN_HEADERS
        )
        assert deleted.status_code == 204
        assert (await questions(client, edition_id))[0]["answered_count"] == 0
    else:
        refused = await client.delete(f"/api/poll-questions/{question['id']}", headers=ADMIN_HEADERS)
        assert (refused.status_code, refused.json()["code"]) == (409, "poll_question_in_use")
        deleted = await client.delete(
            f"/api/poll-questions/{question['id']}?confirm_answers=true", headers=ADMIN_HEADERS
        )
        assert deleted.status_code == 204


@pytest.mark.anyio
async def test_extra_kind_validation_and_option_membership(client, volunteer_client_as, db_session):
    edition = (await _create_event(client, edition_id="extra-invalid"))["edition_id"]
    choice = await create_question(client, edition, "single_choice", "Keuze")
    text = await create_question(client, edition, "free_text", "Tekst")
    rating = await create_question(client, edition, "rating", "Score")
    meals = await create_question(client, edition, "meals", "Eten")
    other = await create_option(client, meals["id"], "Soep")
    option = await create_option(client, choice["id"], "Keuze")
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("subject-invalid-extra")
    person_id = (await db_session.execute(select(Person.id).where(Person.name == "Sofie De Smet"))).scalar_one()
    for question, body in [
        (rating, {"rating": 0}),
        (rating, {"rating": 6}),
        (rating, {"rating": 1.5}),
        (rating, {"rating": True}),
        (rating, {"rating": 3, "text": "wrong"}),
        (text, {"text": "x" * 501}),
        (choice, {"selections": []}),
        (meals, {"selections": [], "rating": 3}),
    ]:
        r = await volunteers.call(
            "subject-invalid-extra", "put", f"/api/me/volunteer/poll/questions/{question['id']}", json=body
        )
        assert r.status_code == 422, r.text
    r = await volunteers.call(
        "subject-invalid-extra",
        "put",
        f"/api/me/volunteer/poll/questions/{choice['id']}",
        json={"option_id": other["id"]},
    )
    assert (r.status_code, r.json()["code"]) == (404, "poll_option_not_found")
    url = f"/api/poll-questions/orders/{person_id}?edition_id={edition}"
    for body in [
        {"choices": [{"question_id": choice["id"], "option_id": other["id"]}]},
        {"ratings": [{"question_id": text["id"], "rating": 3}]},
        {"selections": [{"option_id": option["id"], "quantity": 1}]},
    ]:
        assert (await client.put(url, json=body, headers=ADMIN_HEADERS)).status_code == 404
    duplicate = {"ratings": [{"question_id": rating["id"], "rating": 3}] * 2}
    assert (await client.put(url, json=duplicate, headers=ADMIN_HEADERS)).status_code == 422
    # Blank text clears, including whitespace-only input.
    r = await volunteers.call(
        "subject-invalid-extra", "put", f"/api/me/volunteer/poll/questions/{text['id']}", json={"text": "  "}
    )
    assert r.json()["questions"][1]["text"] is None
