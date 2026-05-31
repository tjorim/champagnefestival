"""Integration tests for PostgreSQL-backed authorized person lookup."""

import pytest

from tests.helpers import ADMIN_HEADERS, _post_registration


async def _create_person(client, *, name: str, email: str) -> dict:
    response = await client.post(
        "/api/people",
        json={"name": name, "email": email},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.anyio
async def test_admin_people_search_handles_diacritics_transliteration_and_typos(client):
    francois = await _create_person(client, name="François Dupont", email="francois@example.com")
    muller = await _create_person(client, name="Müller", email="muller@example.com")

    response = await client.get("/api/people", params={"q": "Francoiss", "active": "true"}, headers=ADMIN_HEADERS)
    assert response.status_code == 200
    assert [person["id"] for person in response.json()] == [francois["id"]]

    response = await client.get("/api/people", params={"q": "Mueller", "active": "true"}, headers=ADMIN_HEADERS)
    assert response.status_code == 200
    assert [person["id"] for person in response.json()] == [muller["id"]]


@pytest.mark.anyio
async def test_admin_people_search_ranks_exact_email_before_typo_suggestion(client):
    exact = await _create_person(client, name="Exact", email="guest@gmail.com")
    typo = await _create_person(client, name="Typo", email="guest@gamil.com")

    response = await client.get("/api/people", params={"q": "guest@gmail.com"}, headers=ADMIN_HEADERS)
    assert response.status_code == 200
    assert [person["id"] for person in response.json()][:2] == [exact["id"], typo["id"]]


@pytest.mark.anyio
async def test_admin_registration_search_uses_ranked_person_lookup(client):
    registration = await _post_registration(
        client,
        path="/api/registrations",
        name="François Dupont",
        email="francois@example.com",
    )
    assert registration.status_code == 201

    response = await client.get("/api/registrations", params={"q": "Francoiss"}, headers=ADMIN_HEADERS)
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [registration.json()["id"]]
