"""Server-side JSON-LD Event structured data for the active festival edition (#992).

Mirrors ``frontend/src/components/JsonLd.tsx`` field-for-field. The shared
``docs/fixtures/jsonld-edition.json`` fixture is exercised by both
``backend/tests/test_jsonld_service.py`` and a frontend contract test
asserting ``EventStructuredData`` reproduces the same structure from the
same input. Dates are computed in a fixed Europe/Brussels timezone rather
than a viewer's local time — the client component's own render is inherently
per-viewer (browser-local time has no single "true" instant to reproduce
server-side); Brussels is used because that is where the event itself
happens, and the frontend contract test pins its own timezone to match so
the two sides can be compared byte-for-byte without that being a claim about
what a real visitor's browser will independently compute.

``festival_name``/``welcome_subtitle`` come from ``app.services.frontend_i18n_snippets``
— see that module's docstring for why they're duplicated rather than read
from the frontend source at runtime.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from app.services.frontend_i18n_snippets import FESTIVAL_NAME, WELCOME_SUBTITLE, Locale

_BRUSSELS = ZoneInfo("Europe/Brussels")
_FESTIVAL_START_HOUR = 17


def _to_js_iso_string(value: datetime) -> str:
    """Format like JS ``Date.prototype.toISOString()``: UTC, ``Z`` suffix, 3-digit ms."""
    utc_value = value.astimezone(UTC)
    return utc_value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc_value.microsecond // 1000:03d}Z"


def _festival_date_range(dates: list[date]) -> tuple[datetime, datetime]:
    """Mirror ``frontend/src/hooks/useActiveEdition.ts``'s ``getFestivalDateRange``:
    first date at 17:00 local, last date at the end of that local day."""
    today = datetime.now(_BRUSSELS).date()
    start_date = dates[0] if dates else today
    end_date = dates[-1] if dates else today
    start = datetime.combine(start_date, time(_FESTIVAL_START_HOUR, 0, 0), tzinfo=_BRUSSELS)
    end = datetime.combine(end_date, time(23, 59, 59, 999000), tzinfo=_BRUSSELS)
    return start, end


def build_event_json_ld(edition: dict, *, base_url: str, locale: Locale) -> dict:
    """Build the same schema.org Event structure ``JsonLd.tsx`` renders client-side.

    *edition* is the same dict shape ``app.services.editions_service.edition_payload``
    returns (and ``EditionOut`` validates) — ``year``, ``dates``, and ``venue``
    (``name``/``address``/``city``/``postal_code``/``country``/``lat``/``lng``) are used.
    """
    start, end = _festival_date_range(edition["dates"])
    venue = edition["venue"]
    return {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": f"{FESTIVAL_NAME} {edition['year']}",
        "startDate": _to_js_iso_string(start),
        "endDate": _to_js_iso_string(end),
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "eventStatus": "https://schema.org/EventScheduled",
        "location": {
            "@type": "Place",
            "name": venue["name"],
            "address": {
                "@type": "PostalAddress",
                "streetAddress": venue["address"],
                "addressLocality": venue["city"],
                "postalCode": venue["postal_code"],
                "addressCountry": venue["country"],
            },
            "geo": {
                "@type": "GeoCoordinates",
                "latitude": venue["lat"],
                "longitude": venue["lng"],
            },
        },
        "image": [f"{base_url}/images/og-image.jpg"],
        "description": WELCOME_SUBTITLE[locale],
        "offers": {
            "@type": "Offer",
            "url": base_url,
            "availability": "https://schema.org/InStock",
            "priceCurrency": "EUR",
        },
        "inLanguage": locale,
        "organizer": {
            "@type": "Organization",
            "name": FESTIVAL_NAME,
            "url": base_url,
        },
    }
