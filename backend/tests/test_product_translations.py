"""Translated product names/descriptions and poll option labels (#1222)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event, _post_registration
from tests.test_poll_options import NISS_A, _create_option, _register


async def _product(client, event_id: str, **overrides) -> dict:
    body = {"event_id": event_id, "price": "25.00", "category": "champagne", **overrides}
    response = await client.post("/api/products", json=body, headers=ADMIN_HEADERS)
    assert response.status_code == 201, response.text
    return response.json()


async def test_a_product_has_a_name_per_language_with_an_original(client):
    event = await _create_event(client, edition_id="edition-product-text")
    product = await _product(
        client,
        event["id"],
        name_language="nl",
        name_nl="Champagnefles",
        name_en="Champagne bottle",
        description_language="nl",
        description_nl="Goed gekoeld",
    )

    assert (product["name"], product["name_language"], product["name_fr"]) == ("Champagnefles", "nl", None)
    assert (product["description"], product["description_en"]) == ("Goed gekoeld", None)

    default = await _product(client, event["id"], name_en="Plain")
    assert default["name_language"] == "en"  # English is the default original language


@pytest.mark.parametrize(
    "overrides",
    [
        {},  # no name at all
        {"name_language": "fr", "name_nl": "Alleen Nederlands"},
        {"name_en": "   "},
        {"name_en": "Bottle", "description_nl": "Tekst"},  # description text but no description language
        {"name_en": "Bottle", "description_language": "en"},  # a description language without text
        {"name": "Old shape"},
    ],
)
async def test_a_product_needs_its_name_in_the_original_language(client, overrides):
    event = await _create_event(client, edition_id="edition-product-text-invalid")
    response = await client.post(
        "/api/products",
        json={"event_id": event["id"], "price": "1", "category": "other", **overrides},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 422, response.text


async def test_updating_one_translation_keeps_the_rest_and_validates_the_result(client):
    event = await _create_event(client, edition_id="edition-product-text-update")
    product = await _product(client, event["id"], name_en="Bottle", description_language="en", description_en="Chilled")

    translated = await client.put(
        f"/api/products/{product['id']}", json={"name_fr": "Bouteille"}, headers=ADMIN_HEADERS
    )
    assert translated.status_code == 200, translated.text
    assert (translated.json()["name_en"], translated.json()["name_fr"]) == ("Bottle", "Bouteille")

    cleared = await client.put(f"/api/products/{product['id']}", json={"name_fr": ""}, headers=ADMIN_HEADERS)
    assert cleared.json()["name_fr"] is None
    no_original = await client.put(f"/api/products/{product['id']}", json={"name_en": ""}, headers=ADMIN_HEADERS)
    assert no_original.status_code == 422
    assert "original language" in no_original.text

    # Clearing every description text drops its language too.
    dropped = await client.put(f"/api/products/{product['id']}", json={"description_en": ""}, headers=ADMIN_HEADERS)
    assert dropped.status_code == 200
    assert (dropped.json()["description"], dropped.json()["description_language"]) == ("", None)


async def test_public_products_resolve_the_visitors_language_with_fallback(client):
    event = await _create_event(client, edition_id="edition-product-text-public")
    await _product(client, event["id"], name_language="nl", name_nl="Fles", name_fr="Bouteille")
    await _product(client, event["id"], name_en="Only English")

    def names(payload):
        edition_events = [e for edition in payload for e in edition["events"]]
        return sorted(p["name"] for e in edition_events for p in e["products"])

    for locale, expected in (
        ("nl", ["Fles", "Only English"]),
        ("fr", ["Bouteille", "Only English"]),
        ("en", ["Fles", "Only English"]),  # no English name on the first: its original is shown
    ):
        response = await client.get("/api/editions/upcoming", params={"locale": locale})
        assert response.status_code == 200
        assert names(response.json()) == expected, locale


async def test_an_order_keeps_the_names_in_every_language(client):
    event = await _create_event(client, edition_id="edition-product-text-order")
    product = await _product(
        client, event["id"], name_language="nl", name_nl="Fles", name_en="Bottle", name_fr="Bouteille"
    )

    registration = await _post_registration(
        client, event=event, order_items=[{"product_id": product["id"], "quantity": 2}]
    )
    assert registration.status_code == 201, registration.text
    item = registration.json()["order_items"][0]
    assert (item["name"], item["name_language"], item["name_en"], item["name_fr"]) == (
        "Fles",
        "nl",
        "Bottle",
        "Bouteille",
    )


async def test_poll_option_labels_follow_the_volunteers_language(client, volunteer_client_as):
    event = await _create_event(client, edition_id="edition-poll-text")
    edition_id = event["edition_id"]
    created = await client.post(
        "/api/poll-options",
        json={
            "edition_id": edition_id,
            "kind": "dish",
            "label_language": "nl",
            "label_nl": "Stoofvlees",
            "label_en": "Beef stew",
        },
        headers=ADMIN_HEADERS,
    )
    assert created.status_code == 201, created.text
    assert (created.json()["label"], created.json()["label_language"]) == ("Stoofvlees", "nl")
    assert (await _create_option(client, edition_id=edition_id, kind="soup", label="Tomato soup"))[
        "label_language"
    ] == "en"

    option_id = created.json()["id"]
    cleared = await client.put(f"/api/poll-options/{option_id}", json={"label_nl": ""}, headers=ADMIN_HEADERS)
    assert cleared.status_code == 422
    translated = await client.put(
        f"/api/poll-options/{option_id}", json={"label_fr": "Carbonade"}, headers=ADMIN_HEADERS
    )
    assert translated.json()["label_fr"] == "Carbonade"

    async with volunteer_client_as("subject-poll-text") as vclient:
        assert (await _register(vclient, niss=NISS_A)).status_code == 200
        for locale, dish in (("en", "Beef stew"), ("nl", "Stoofvlees"), ("fr", "Carbonade")):
            response = await vclient.get("/api/me/volunteer/poll-options", params={"locale": locale})
            assert response.status_code == 200, response.text
            labels = {o["kind"]: o["label"] for o in response.json()["options"]}
            assert labels == {"dish": dish, "soup": "Tomato soup"}, locale
