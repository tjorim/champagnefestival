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
        "offers": {
            "@type": "Offer",
            "url": "https://champagnefestival.tjor.im",
            "availability": "https://schema.org/InStock",
            "priceCurrency": "EUR",
        },
        "inLanguage": "nl",
        "organizer": {
            "@type": "Organization",
            "name": "Champagnefestival",
            "url": "https://champagnefestival.tjor.im",
        },
    }


def test_build_event_json_ld_uses_the_requested_locale_for_description_and_language():
    edition = _load_edition_fixture()

    result = build_event_json_ld(edition, base_url="https://example.test", locale="en")

    assert result["description"] == "A celebration of fine champagne and community"
    assert result["inLanguage"] == "en"


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
