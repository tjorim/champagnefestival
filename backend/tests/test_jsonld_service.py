"""Tests for #992's server-side JSON-LD builder.

``docs/fixtures/jsonld-edition.json`` is the shared contract with the
frontend's ``EventStructuredData`` component (decision 3 in
docs/decisions/992-live-public-render.md) — both sides build a JSON-LD
Event from this same fixed input and are expected to produce the same
structure. The frontend contract test pins its own timezone to
Europe/Brussels so the two are comparable byte-for-byte.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from app.services.frontend_i18n_snippets import FAQ_TITLE, FESTIVAL_NAME, SCHEDULE_TITLE, WELCOME_SUBTITLE
from app.services.jsonld_service import build_event_json_ld

_FIXTURE = Path(__file__).parents[2] / "docs" / "fixtures" / "jsonld-edition.json"
_MESSAGES_DIR = Path(__file__).parents[2] / "frontend" / "messages"


def _load_edition_fixture() -> dict:
    """The JSON fixture stores dates as ISO strings (portable to the
    frontend's own JSON.parse); real ``edition_payload`` dicts carry native
    ``date`` objects (from SQLAlchemy columns), so parse them the same way
    here to exercise the function with the shape it actually receives."""
    raw = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    raw["dates"] = [date.fromisoformat(d) for d in raw["dates"]]
    for event in raw["events"]:
        event["date"] = date.fromisoformat(event["date"])
    return raw


def test_build_event_json_ld_matches_the_expected_structure():
    edition = _load_edition_fixture()

    result = build_event_json_ld(edition, base_url="https://champagnefestival.tjor.im", locale="nl")

    assert result == {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Champagnefestival 2027",
        "startDate": "2027-03-19T16:00:00.000Z",
        "endDate": "2027-03-21T22:59:59.999Z",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "eventStatus": "https://schema.org/EventScheduled",
        "location": {
            "@type": "Place",
            "name": "Kursaal Oostende",
            "address": {
                "@type": "PostalAddress",
                "streetAddress": "Monacoplein 24",
                "addressLocality": "Oostende",
                "postalCode": "8400",
                "addressCountry": "Belgium",
            },
            "geo": {
                "@type": "GeoCoordinates",
                "latitude": 51.2298,
                "longitude": 2.9203,
            },
        },
        "image": ["https://champagnefestival.tjor.im/images/og-image.jpg"],
        "description": "Een viering van fijne champagne en gemeenschap",
        "offers": [
            {
                "@type": "Offer",
                "name": "Toegangsticket",
                "url": "https://champagnefestival.tjor.im",
                "price": "25.00",
                "priceCurrency": "EUR",
                "availability": "https://schema.org/InStock",
            },
            {
                "@type": "Offer",
                "name": "Brunchticket",
                "url": "https://champagnefestival.tjor.im",
                "price": "45.50",
                "priceCurrency": "EUR",
                "availability": "https://schema.org/SoldOut",
            },
        ],
        "inLanguage": "nl",
        "organizer": {
            "@type": "Organization",
            "name": "Champagnefestival",
            "url": "https://champagnefestival.tjor.im",
        },
        "subEvent": [
            {
                "@type": "Event",
                "name": "Openingsreceptie",
                "startDate": "2027-03-19T17:00:00.000Z",
                "endDate": "2027-03-19T19:00:00.000Z",
                "description": "Welkom met een glas champagne",
            },
            {"@type": "Event", "name": "Brunch", "startDate": "2027-03-21T10:00:00.000Z"},
        ],
    }


def test_build_event_json_ld_uses_the_requested_locale_for_description_and_language():
    edition = _load_edition_fixture()

    result = build_event_json_ld(edition, base_url="https://example.test", locale="en")

    assert result["description"] == "A celebration of fine champagne and community"
    assert result["inLanguage"] == "en"


def test_build_event_json_ld_names_sub_events_in_the_requested_locale_with_fallback():
    edition = _load_edition_fixture()

    english = build_event_json_ld(edition, base_url="https://example.test", locale="en")["subEvent"]
    french = build_event_json_ld(edition, base_url="https://example.test", locale="fr")["subEvent"]

    assert [event["name"] for event in english] == ["Opening reception", "Brunch"]
    assert [event["name"] for event in french] == ["Réception d'ouverture", "Brunch"]
    # Only the Dutch description exists, so every locale shows it.
    assert english[0]["description"] == french[0]["description"] == "Welkom met een glas champagne"


def test_build_event_json_ld_advertises_only_required_priced_products():
    edition = _load_edition_fixture()

    offers = build_event_json_ld(edition, base_url="https://example.test", locale="nl")["offers"]

    # The optional "Champagnepakket" extra is not an entry offer.
    assert [offer["name"] for offer in offers] == ["Toegangsticket", "Brunchticket"]
    assert all(offer["price"] and offer["priceCurrency"] == "EUR" for offer in offers)


def test_build_event_json_ld_merges_a_shared_product_and_is_sold_out_only_when_all_are():
    edition = _load_edition_fixture()
    ticket = edition["events"][0]["products"][0]
    edition["events"][0]["products"][0] = {**ticket, "sold_out": True}
    edition["events"][1]["products"] = [{**ticket, "sold_out": False}]

    offers = build_event_json_ld(edition, base_url="https://example.test", locale="nl")["offers"]

    assert len(offers) == 1
    assert offers[0]["availability"] == "https://schema.org/InStock"


def test_build_event_json_ld_omits_offers_without_required_products():
    edition = _load_edition_fixture()
    for event in edition["events"]:
        event["products"] = []

    assert "offers" not in build_event_json_ld(edition, base_url="https://example.test", locale="nl")


def test_build_event_json_ld_omits_sub_events_without_events():
    edition = _load_edition_fixture()
    edition["events"] = []

    assert "subEvent" not in build_event_json_ld(edition, base_url="https://example.test", locale="nl")


def test_frontend_i18n_snippets_match_the_real_translation_files():
    """Fails CI if messages/*.json changes without updating the duplicated
    constants these server-rendered pages use — see
    app.services.frontend_i18n_snippets's module docstring."""
    for locale, welcome_subtitle in WELCOME_SUBTITLE.items():
        messages = json.loads((_MESSAGES_DIR / f"{locale}.json").read_text(encoding="utf-8"))
        assert messages["festival_name"] == FESTIVAL_NAME
        assert messages["welcome_subtitle"] == welcome_subtitle
        assert messages["faq_title"] == FAQ_TITLE[locale]
        assert messages["schedule_title"] == SCHEDULE_TITLE[locale]
