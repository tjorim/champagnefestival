"""Translated product names and descriptions (#1222)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event, _post_registration


async def _product(client, event_id: str, **overrides) -> dict:
    body = {"event_id": event_id, "price": "25.00", "category": "champagne", **overrides}
    response = await client.post("/api/products", json=body, headers=ADMIN_HEADERS)
    assert response.status_code == 201, response.text
    return response.json()


async def test_a_product_has_a_name_per_language_with_dutch_required(client):
    event = await _create_event(client, edition_id="edition-product-text")
    product = await _product(
        client,
        event["id"],
        name_nl="Champagnefles",
        name_en="Champagne bottle",
        description_nl="Goed gekoeld",
    )

    assert (product["name"], product["name_en"], product["name_fr"]) == ("Champagnefles", "Champagne bottle", None)
    assert (product["description"], product["description_en"]) == ("Goed gekoeld", None)
    assert "name_language" not in product


@pytest.mark.parametrize(
    "overrides",
    [
        {},  # no name at all
        {"name_fr": "Alleen Frans"},  # no Dutch name
        {"name_nl": "   "},
        {"name_nl": "Fles", "description_fr": "Texte"},  # a translated description without Dutch
        {"name_nl": "Fles", "name_language": "nl"},  # the original-language flag is gone
        {"name": "Old shape"},
    ],
)
async def test_a_product_needs_its_dutch_name(client, overrides):
    event = await _create_event(client, edition_id="edition-product-text-invalid")
    response = await client.post(
        "/api/products",
        json={"event_id": event["id"], "price": "1", "category": "other", **overrides},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 422, response.text


async def test_updating_one_translation_keeps_the_rest_and_validates_the_result(client):
    event = await _create_event(client, edition_id="edition-product-text-update")
    product = await _product(
        client, event["id"], name_nl="Fles", name_en="Bottle", description_nl="Gekoeld", description_en="Chilled"
    )

    translated = await client.put(
        f"/api/products/{product['id']}", json={"name_fr": "Bouteille"}, headers=ADMIN_HEADERS
    )
    assert translated.status_code == 200, translated.text
    assert (translated.json()["name_en"], translated.json()["name_fr"]) == ("Bottle", "Bouteille")

    cleared = await client.put(f"/api/products/{product['id']}", json={"name_fr": ""}, headers=ADMIN_HEADERS)
    assert cleared.json()["name_fr"] is None
    no_dutch = await client.put(f"/api/products/{product['id']}", json={"name_nl": ""}, headers=ADMIN_HEADERS)
    assert no_dutch.status_code == 422
    assert "Dutch" in no_dutch.text

    # The Dutch description stays while a translation remains; clearing every description text is allowed.
    keeps_dutch = await client.put(f"/api/products/{product['id']}", json={"description_nl": ""}, headers=ADMIN_HEADERS)
    assert keeps_dutch.status_code == 422
    dropped = await client.put(
        f"/api/products/{product['id']}", json={"description_nl": "", "description_en": ""}, headers=ADMIN_HEADERS
    )
    assert dropped.status_code == 200
    assert dropped.json()["description"] == ""


async def test_public_products_resolve_the_visitors_language_with_fallback(client):
    event = await _create_event(client, edition_id="edition-product-text-public")
    await _product(client, event["id"], name_nl="Fles", name_fr="Bouteille")
    await _product(client, event["id"], name_nl="Only English")

    def names(payload):
        edition_events = [e for edition in payload for e in edition["events"]]
        return sorted(p["name"] for e in edition_events for p in e["products"])

    for locale, expected in (
        ("nl", ["Fles", "Only English"]),
        ("fr", ["Bouteille", "Only English"]),
        ("en", ["Fles", "Only English"]),  # no English name: Dutch is shown
    ):
        response = await client.get("/api/editions/upcoming", params={"locale": locale})
        assert response.status_code == 200
        assert names(response.json()) == expected, locale


async def test_an_order_keeps_the_names_in_every_language(client):
    event = await _create_event(client, edition_id="edition-product-text-order")
    product = await _product(client, event["id"], name_nl="Fles", name_en="Bottle", name_fr="Bouteille")

    registration = await _post_registration(
        client, event=event, order_items=[{"product_id": product["id"], "quantity": 2}]
    )
    assert registration.status_code == 201, registration.text
    item = registration.json()["order_items"][0]
    assert (item["name"], item["name_nl"], item["name_en"], item["name_fr"]) == (
        "Fles",
        "Fles",
        "Bottle",
        "Bouteille",
    )
