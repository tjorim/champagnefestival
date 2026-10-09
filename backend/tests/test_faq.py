"""Tests for the FAQ API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS

DUTCH_ONLY = {
    "text_language": "nl",
    "question_nl": "Waar gaat het over?",
    "answer_nl": "Een viering van champagne.",
}


@pytest.mark.anyio
async def test_faq_admin_endpoints_require_admin(unauth_client):
    r = await unauth_client.get("/api/faq")
    assert r.status_code == 401

    r = await unauth_client.post("/api/faq", json=DUTCH_ONLY)
    assert r.status_code == 401


@pytest.mark.anyio
async def test_faq_admin_endpoints_reject_non_admin(forbidden_client):
    r = await forbidden_client.get("/api/faq")
    assert r.status_code == 403


@pytest.mark.anyio
async def test_active_faq_defaults_to_dutch(client):
    """/active has no require_admin dependency at all (see test_faq_admin_endpoints_*
    for the endpoints that do); this only checks its own behavior: defaulting
    to Dutch when no locale is given."""
    r = await client.post("/api/faq", json=DUTCH_ONLY, headers=ADMIN_HEADERS)
    assert r.status_code == 201

    r = await client.get("/api/faq/active")
    assert r.status_code == 200
    assert [i["question"] for i in r.json()] == [DUTCH_ONLY["question_nl"]]


@pytest.mark.anyio
async def test_faq_crud(client):
    r = await client.post(
        "/api/faq",
        json={
            "text_language": "nl",
            "question_nl": "Wanneer?",
            "answer_nl": "Op 2 oktober.",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    item = r.json()
    assert item["question_nl"] == "Wanneer?"
    assert item["question_en"] is None
    assert item["question_fr"] is None
    assert item["active"] is True
    faq_id = item["id"]

    # Admin listing shows every locale field.
    r = await client.get("/api/faq", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1

    # Update: fill in the English translation.
    r = await client.put(
        f"/api/faq/{faq_id}",
        json={"question_en": "When?", "answer_en": "On 2 October."},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["question_en"] == "When?"
    assert r.json()["question_nl"] == "Wanneer?"  # untouched

    # Delete.
    r = await client.delete(f"/api/faq/{faq_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204
    r = await client.get("/api/faq", headers=ADMIN_HEADERS)
    assert r.json() == []


@pytest.mark.anyio
async def test_active_faq_falls_back_to_the_original_language(client):
    """An item is shown in a language only when its question and answer are both
    translated there; otherwise the original language is shown, not nothing."""
    r = await client.post(
        "/api/faq",
        json={
            "text_language": "nl",
            "question_nl": "Nederlandse vraag",
            "answer_nl": "Nederlands antwoord",
            "question_en": "English question",
            "answer_en": "English answer",
            "question_fr": "Question française",  # no French answer: a half translation is not used
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    for locale, question, answer in (
        ("nl", "Nederlandse vraag", "Nederlands antwoord"),
        ("en", "English question", "English answer"),
        ("fr", "Nederlandse vraag", "Nederlands antwoord"),
    ):
        r = await client.get("/api/faq/active", params={"locale": locale})
        assert r.status_code == 200
        assert [(i["question"], i["answer"]) for i in r.json()] == [(question, answer)], locale


@pytest.mark.anyio
async def test_faq_create_and_update_validate_the_original_language(client):
    for body in (
        {"question_nl": "Vraag", "answer_nl": "Antwoord"},  # default original (en) is empty
        {"text_language": "nl", "question_nl": "Vraag"},  # no answer
        {"text_language": "fr", "question_nl": "Vraag", "answer_nl": "Antwoord"},
        {"text_language": "nl", "question_nl": "  ", "answer_nl": "Antwoord"},
        {"question": "Old shape", "answer": "x"},
    ):
        assert (await client.post("/api/faq", json=body, headers=ADMIN_HEADERS)).status_code == 422, body

    created = await client.post("/api/faq", json=DUTCH_ONLY, headers=ADMIN_HEADERS)
    faq_id = created.json()["id"]
    no_answer = await client.put(f"/api/faq/{faq_id}", json={"answer_nl": ""}, headers=ADMIN_HEADERS)
    assert no_answer.status_code == 400
    assert "original language" in no_answer.text
    english = await client.post(
        "/api/faq", json={"question_en": "Question", "answer_en": "Answer"}, headers=ADMIN_HEADERS
    )
    assert english.status_code == 201
    assert english.json()["text_language"] == "en"  # English is the default original language

    switched = await client.put(
        f"/api/faq/{faq_id}",
        json={"text_language": "en", "question_en": "Q", "answer_en": "A"},
        headers=ADMIN_HEADERS,
    )
    assert switched.status_code == 200
    assert (await client.get("/api/faq/active", params={"locale": "fr"})).json()[0]["question"] in ("Q", "Question")


@pytest.mark.anyio
async def test_faq_translation_can_be_cleared_to_fall_back(client):
    r = await client.post(
        "/api/faq",
        json={
            "text_language": "nl",
            "question_nl": "Vraag",
            "answer_nl": "Antwoord",
            "question_en": "Question",
            "answer_en": "Answer",
        },
        headers=ADMIN_HEADERS,
    )
    faq_id = r.json()["id"]

    r = await client.get("/api/faq/active", params={"locale": "en"})
    assert len(r.json()) == 1

    # Clearing with an explicit empty string makes English fall back to the original.
    r = await client.put(
        f"/api/faq/{faq_id}",
        json={"question_en": "", "answer_en": ""},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["question_en"] is None
    assert r.json()["answer_en"] is None

    r = await client.get("/api/faq/active", params={"locale": "en"})
    assert [i["question"] for i in r.json()] == ["Vraag"]

    # Dutch is untouched throughout.
    r = await client.get("/api/faq/active", params={"locale": "nl"})
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_active_faq_excludes_inactive_items(client):
    r = await client.post(
        "/api/faq",
        json={**DUTCH_ONLY, "active": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.get("/api/faq/active", params={"locale": "nl"})
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.anyio
async def test_faq_requires_dutch_question_and_answer(client):
    r = await client.post(
        "/api/faq", json={"text_language": "nl", "question_nl": "", "answer_nl": "x"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 422

    r = await client.post("/api/faq", json={"answer_nl": "x"}, headers=ADMIN_HEADERS)
    assert r.status_code == 422


@pytest.mark.anyio
async def test_active_faq_respects_sort_order(client):
    """Items are created in append order, then reordering (not sort_order on
    create/update) is what changes display order — see test_faq_reorder_*
    below for the dedicated reorder endpoint (#836)."""
    r = await client.post(
        "/api/faq", json={"text_language": "nl", "question_nl": "First", "answer_nl": "a"}, headers=ADMIN_HEADERS
    )
    first_id = r.json()["id"]
    r = await client.post(
        "/api/faq", json={"text_language": "nl", "question_nl": "Second", "answer_nl": "b"}, headers=ADMIN_HEADERS
    )
    second_id = r.json()["id"]

    r = await client.get("/api/faq/active", params={"locale": "nl"})
    assert [i["question"] for i in r.json()] == ["First", "Second"]

    r = await client.post("/api/faq/reorder", json={"ordered_ids": [second_id, first_id]}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert [i["id"] for i in r.json()] == [second_id, first_id]

    r = await client.get("/api/faq/active", params={"locale": "nl"})
    assert [i["question"] for i in r.json()] == ["Second", "First"]


@pytest.mark.anyio
async def test_faq_create_appends_after_the_current_last_item(client):
    r = await client.post("/api/faq", json=DUTCH_ONLY, headers=ADMIN_HEADERS)
    first = r.json()
    r = await client.post(
        "/api/faq", json={"text_language": "nl", "question_nl": "Tweede", "answer_nl": "b"}, headers=ADMIN_HEADERS
    )
    second = r.json()
    assert second["sort_order"] > first["sort_order"]


@pytest.mark.anyio
async def test_faq_reorder_rejects_stale_or_partial_list(client):
    r = await client.post("/api/faq", json=DUTCH_ONLY, headers=ADMIN_HEADERS)
    first_id = r.json()["id"]
    r = await client.post(
        "/api/faq", json={"text_language": "nl", "question_nl": "Tweede", "answer_nl": "b"}, headers=ADMIN_HEADERS
    )
    second_id = r.json()["id"]

    # Missing an existing item.
    r = await client.post("/api/faq/reorder", json={"ordered_ids": [first_id]}, headers=ADMIN_HEADERS)
    assert r.status_code == 409

    # Names an item that doesn't exist.
    r = await client.post(
        "/api/faq/reorder", json={"ordered_ids": [first_id, second_id, "faq_nonexistent"]}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 409


@pytest.mark.anyio
async def test_faq_reorder_rejects_duplicate_ids(client):
    r = await client.post("/api/faq", json=DUTCH_ONLY, headers=ADMIN_HEADERS)
    first_id = r.json()["id"]

    r = await client.post("/api/faq/reorder", json={"ordered_ids": [first_id, first_id]}, headers=ADMIN_HEADERS)
    assert r.status_code == 400


@pytest.mark.anyio
async def test_faq_update_cannot_set_sort_order(client):
    """sort_order isn't part of the update payload shape at all — reordering
    only happens through /api/faq/reorder (#836)."""
    r = await client.post("/api/faq", json=DUTCH_ONLY, headers=ADMIN_HEADERS)
    item = r.json()

    r = await client.put(
        f"/api/faq/{item['id']}", json={"sort_order": 99, "question_nl": "Aangepast"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 422

    unchanged = await client.get("/api/faq", headers=ADMIN_HEADERS)
    assert unchanged.json()[0]["sort_order"] == item["sort_order"]
    assert unchanged.json()[0]["question_nl"] == item["question_nl"]
