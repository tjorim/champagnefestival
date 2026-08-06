"""Tests for the FAQ API."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS

DUTCH_ONLY = {
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
            "question_nl": "Wanneer?",
            "answer_nl": "Op 2 oktober.",
            "sort_order": 0,
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
async def test_active_faq_filters_by_locale(client):
    """An item with no translation for a locale is absent from that locale's list, not backfilled."""
    r = await client.post(
        "/api/faq",
        json={
            "question_nl": "Nederlandse vraag",
            "answer_nl": "Nederlands antwoord",
            "question_en": "English question",
            "answer_en": "English answer",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.get("/api/faq/active", params={"locale": "nl"})
    assert r.status_code == 200
    assert [i["question"] for i in r.json()] == ["Nederlandse vraag"]

    r = await client.get("/api/faq/active", params={"locale": "en"})
    assert r.status_code == 200
    assert [i["question"] for i in r.json()] == ["English question"]

    # No French translation was provided — the item must not appear, and must
    # not silently show the Dutch or English text instead.
    r = await client.get("/api/faq/active", params={"locale": "fr"})
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.anyio
async def test_faq_locale_can_be_cleared_to_hide_it(client):
    r = await client.post(
        "/api/faq",
        json={
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

    # Clearing with an explicit empty string hides it from English again.
    r = await client.put(
        f"/api/faq/{faq_id}",
        json={"question_en": "", "answer_en": ""},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["question_en"] is None
    assert r.json()["answer_en"] is None

    r = await client.get("/api/faq/active", params={"locale": "en"})
    assert r.json() == []

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
    r = await client.post("/api/faq", json={"question_nl": "", "answer_nl": "x"}, headers=ADMIN_HEADERS)
    assert r.status_code == 422

    r = await client.post("/api/faq", json={"answer_nl": "x"}, headers=ADMIN_HEADERS)
    assert r.status_code == 422


@pytest.mark.anyio
async def test_active_faq_respects_sort_order(client):
    r = await client.post(
        "/api/faq", json={"question_nl": "Second", "answer_nl": "b", "sort_order": 1}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 201
    r = await client.post(
        "/api/faq", json={"question_nl": "First", "answer_nl": "a", "sort_order": 0}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 201

    r = await client.get("/api/faq/active", params={"locale": "nl"})
    assert [i["question"] for i in r.json()] == ["First", "Second"]
