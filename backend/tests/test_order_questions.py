"""Visitor answers are optional, typed, scoped to one order and immutable in history."""

import pytest

from tests.helpers import ADMIN_HEADERS, VALID_RESERVATION, _create_event


def config():
    return {
        "questions": [
            {
                "id": "transport",
                "kind": "single_choice",
                "title_nl": "Vervoer",
                "title_en": "Transport",
                "options": [{"id": "bike", "label_nl": "Fiets", "label_en": "Bike"}],
            },
            {"id": "comment", "kind": "free_text", "title_nl": "Opmerking"},
            {"id": "score", "kind": "rating", "title_nl": "Score"},
        ]
    }


async def setup(client):
    event = await _create_event(client)
    response = await client.put(f"/api/events/{event['id']}/order-questions", json=config(), headers=ADMIN_HEADERS)
    assert response.status_code == 200, response.text
    return event


@pytest.mark.anyio
async def test_order_answers_checkout_details_admin_export_and_history(client):
    event = await setup(client)
    answers = [
        {"question_id": "transport", "option_id": "bike"},
        {"question_id": "comment", "text": "  Meer soep  "},
        {"question_id": "score", "rating": 5},
    ]
    created = await client.post(
        "/api/registrations", json={**VALID_RESERVATION, "event_id": event["id"], "order_answers": answers}
    )
    assert created.status_code == 201, created.text
    booking = created.json()
    assert [a["question_id"] for a in booking["order_answers"]] == ["transport", "comment", "score"]
    assert booking["order_answers"][1]["text"] == "Meer soep"
    assert booking["amount_due"] is None
    other = await client.post("/api/registrations", json={**VALID_RESERVATION, "event_id": event["id"]})
    assert other.status_code == 201, other.text
    assert other.json()["order_answers"] == []
    detail = await client.get(f"/api/registrations/{booking['id']}", headers=ADMIN_HEADERS)
    assert len(detail.json()["order_answers"]) == 3
    edited = await client.put(
        f"/api/registrations/{booking['id']}",
        json={"order_answers": [{"question_id": "score", "rating": 2}]},
        headers=ADMIN_HEADERS,
    )
    assert edited.status_code == 200, edited.text
    assert len(edited.json()["order_answers"]) == 1
    assert edited.json()["order_answers"][0]["rating"] == 2
    # Used definitions cannot be changed, but can be deactivated and stay readable on old orders.
    changed = config()
    changed["questions"][2]["title_nl"] = "Anders"
    refused = await client.put(f"/api/events/{event['id']}/order-questions", json=changed, headers=ADMIN_HEADERS)
    assert (refused.status_code, refused.json()["code"]) == (409, "order_question_in_use")
    disabled = config()
    disabled["questions"][2]["active"] = False
    done = await client.put(f"/api/events/{event['id']}/order-questions", json=disabled, headers=ADMIN_HEADERS)
    assert done.status_code == 200, done.text
    export = await client.get("/api/registrations/export", params={"event_id": event["id"]}, headers=ADMIN_HEADERS)
    assert export.status_code == 200
    assert "Score: 2" in export.text
    assert (
        await client.put(f"/api/registrations/{booking['id']}", json={"notes": "Kept"}, headers=ADMIN_HEADERS)
    ).json()["order_answers"][0]["rating"] == 2
    # Admin correction remains possible for a deactivated question; an empty list clears.
    cleared = await client.put(f"/api/registrations/{booking['id']}", json={"order_answers": []}, headers=ADMIN_HEADERS)
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["order_answers"] == []


@pytest.mark.anyio
async def test_question_scope_type_validation_and_optional_clearing(client, monkeypatch):
    monkeypatch.setattr("app.routers.registrations.check_rate_limit", lambda *args, **kwargs: True)
    event = await setup(client)
    other_response = await client.post(
        "/api/events",
        json={
            "edition_id": event["edition_id"],
            "title_nl": "Ander",
            "date": "2099-03-22",
            "start_time": "18:00",
            "category": "general",
            "registration_required": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert other_response.status_code == 201, other_response.text
    other = other_response.json()
    for event_id, answers in [
        (other["id"], [{"question_id": "score", "rating": 3}]),
        (event["id"], [{"question_id": "score", "rating": 6}]),
        (event["id"], [{"question_id": "score", "rating": True}]),
        (event["id"], [{"question_id": "score", "text": "wrong"}]),
        (event["id"], [{"question_id": "score", "rating": 3, "text": "mixed"}]),
        (event["id"], [{"question_id": "score", "rating": 3}] * 2),
        (event["id"], [{"question_id": "transport", "option_id": "missing"}]),
        (event["id"], [{"question_id": "comment", "text": "x" * 501}]),
    ]:
        r = await client.post(
            "/api/registrations", json={**VALID_RESERVATION, "event_id": event_id, "order_answers": answers}
        )
        assert r.status_code == 422, r.text
    created = await client.post(
        "/api/registrations",
        json={
            **VALID_RESERVATION,
            "event_id": event["id"],
            "order_answers": [{"question_id": "comment", "text": "  "}, {"question_id": "score", "rating": None}],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["order_answers"] == []


@pytest.mark.anyio
async def test_configuration_retries_and_deactivation_keep_existing_order_answers(client):
    event = await setup(client)
    url = f"/api/events/{event['id']}/order-questions"
    original = (await client.get(f"/api/events/{event['id']}", headers=ADMIN_HEADERS)).json()["order_questions"]
    for _ in range(2):
        response = await client.put(url, json=config(), headers=ADMIN_HEADERS)
        assert response.status_code == 200, response.text
        assert response.json() == original
    created = await client.post(
        "/api/registrations",
        json={**VALID_RESERVATION, "event_id": event["id"], "order_answers": [{"question_id": "score", "rating": 4}]},
    )
    assert created.status_code == 201, created.text
    disabled = await client.put(url, json={"questions": []}, headers=ADMIN_HEADERS)
    assert disabled.status_code == 200, disabled.text
    assert len(disabled.json()) == 1 and disabled.json()[0]["active"] is False
    refused = await client.post(
        "/api/registrations",
        json={**VALID_RESERVATION, "event_id": event["id"], "order_answers": [{"question_id": "score", "rating": 5}]},
    )
    assert (refused.status_code, refused.json()["code"]) == (422, "order_question_unavailable")
    detail = await client.get(f"/api/registrations/{created.json()['id']}", headers=ADMIN_HEADERS)
    assert detail.json()["order_answers"][0]["rating"] == 4
