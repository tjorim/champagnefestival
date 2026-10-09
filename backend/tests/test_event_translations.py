"""Translated event titles, descriptions and categories (#1222)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.event_content import EVENT_CATEGORIES, resolve_text
from app.models import AuditEntry, Event
from app.services import organization_translation as translation
from tests.helpers import ADMIN_HEADERS, _create_event

_FIXTURE_DIST = Path(__file__).parent / "fixtures" / "frontend_dist"
_MESSAGES_DIR = Path(__file__).parents[2] / "frontend" / "messages"


async def _post_event(client, edition_id: str, **overrides):
    body = {
        "edition_id": edition_id,
        "date": "2099-03-21",
        "start_time": "18:00",
        "category": "tasting",
        **overrides,
    }
    return await client.post("/api/events", json=body, headers=ADMIN_HEADERS)


async def _translated_event(client, edition_id: str = "edition-translated") -> dict:
    """An event with Dutch as original, French and English translations."""
    event = await _create_event(client, edition_id=edition_id)
    response = await client.put(
        f"/api/events/{event['id']}",
        json={
            "title_nl": "Openingsavond",
            "title_fr": "Soirée d'ouverture",
            "title_en": "Opening night",
            "description_language": "nl",
            "description_nl": "Een glas om te starten",
            "description_fr": "Un verre pour commencer",
        },
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_resolve_text_prefers_the_locale_then_the_original_and_ignores_blanks():
    values = {"nl": "Titel", "fr": "  ", "en": "Title"}
    assert resolve_text(values, "nl", "en") == "Title"
    assert resolve_text(values, "nl", "fr") == "Titel"
    assert resolve_text(values, "nl", None) == "Titel"
    assert resolve_text(values, "nl", "de") == "Titel"
    assert resolve_text({"nl": None, "fr": None, "en": None}, None, "en") == ""


def test_every_category_has_a_label_in_every_language():
    for locale in ("nl", "fr", "en"):
        messages = json.loads((_MESSAGES_DIR / f"{locale}.json").read_text(encoding="utf-8"))
        for category in EVENT_CATEGORIES:
            assert messages.get(f"schedule_categories_{category}"), f"{locale} lacks schedule_categories_{category}"


async def test_create_accepts_translations_with_a_chosen_original_language(client):
    created = await _create_event(client, edition_id="edition-create-translated")
    response = await _post_event(
        client,
        created["edition_id"],
        title_language="fr",
        title_fr="Dégustation",
        title_en="Tasting",
        description_language="en",
        description_en="An evening",
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["title"] == "Dégustation"  # unresolved responses use the original language
    assert (body["title_language"], body["title_nl"], body["title_fr"], body["title_en"]) == (
        "fr",
        None,
        "Dégustation",
        "Tasting",
    )
    assert (body["description"], body["description_language"]) == ("An evening", "en")


@pytest.mark.parametrize(
    "overrides",
    [
        {},  # no title at all
        {"title": "Vrijdag"},  # a single-language title is not accepted any more
        {"title_nl": "Titel", "description": "Een avond"},
        {"title_language": "fr", "title_nl": "Alleen Nederlands"},  # original language has no text
        {"title_nl": "   "},
        {"title_nl": "Titel", "description_language": "fr", "description_nl": "Tekst"},
        {"title_nl": "Titel", "description_language": "nl"},  # a language without any description text
        {"title_nl": "Titel", "title_language": "de"},
        {"title_nl": "x" * 201},
    ],
)
async def test_create_rejects_a_missing_or_inconsistent_original(client, overrides):
    created = await _create_event(client, edition_id="edition-create-invalid")
    response = await _post_event(client, created["edition_id"], **overrides)
    assert response.status_code == 422, response.text


async def test_the_category_must_be_one_of_the_fixed_list(client):
    created = await _create_event(client, edition_id="edition-category")
    for category in EVENT_CATEGORIES:
        response = await _post_event(client, created["edition_id"], title_nl="Event", category=category)
        assert response.status_code == 201, (category, response.text)

    rejected = await _post_event(client, created["edition_id"], title_nl="Event", category="Gala")
    assert rejected.status_code == 422
    update = await client.put(f"/api/events/{created['id']}", json={"category": "gala"}, headers=ADMIN_HEADERS)
    assert update.status_code == 422
    assert (await client.get("/api/events", params={"category": "gala"}, headers=ADMIN_HEADERS)).status_code == 422
    listed = await client.get("/api/events", params={"category": "ceremony"}, headers=ADMIN_HEADERS)
    assert [event["category"] for event in listed.json()] == ["ceremony"]


async def test_update_changes_one_language_and_clears_translations(client):
    event = await _translated_event(client, "edition-update-translated")
    assert event["title"] == "Openingsavond"

    changed = await client.put(
        f"/api/events/{event['id']}", json={"title_en": "Opening evening"}, headers=ADMIN_HEADERS
    )
    assert changed.status_code == 200
    assert (changed.json()["title_nl"], changed.json()["title_en"]) == ("Openingsavond", "Opening evening")
    assert changed.json()["title_fr"] == "Soirée d'ouverture"

    cleared = await client.put(f"/api/events/{event['id']}", json={"title_fr": ""}, headers=ADMIN_HEADERS)
    assert cleared.json()["title_fr"] is None

    original = await client.put(f"/api/events/{event['id']}", json={"title_nl": " "}, headers=ADMIN_HEADERS)
    assert original.status_code == 422
    assert "original language" in original.text

    unknown = await client.put(f"/api/events/{event['id']}", json={"title": "Legacy"}, headers=ADMIN_HEADERS)
    assert unknown.status_code == 422  # only the per-language fields are accepted


async def test_update_can_switch_the_original_language_and_drop_the_description(client):
    event = await _translated_event(client, "edition-update-original")

    no_text = await client.put(f"/api/events/{event['id']}", json={"title_language": "fr"}, headers=ADMIN_HEADERS)
    assert no_text.status_code == 200  # French text exists, so French can become the original
    assert no_text.json()["title"] == "Soirée d'ouverture"

    invalid = await client.put(f"/api/events/{event['id']}", json={"description_language": "en"}, headers=ADMIN_HEADERS)
    assert invalid.status_code == 422

    dropped = await client.put(
        f"/api/events/{event['id']}",
        json={"description_nl": "", "description_fr": ""},
        headers=ADMIN_HEADERS,
    )
    assert dropped.status_code == 200, dropped.text
    assert (dropped.json()["description"], dropped.json()["description_language"]) == ("", None)


async def test_audit_entry_names_the_changed_text_fields(client, db_session):
    event = await _translated_event(client, "edition-audit")
    entries = (await db_session.execute(select(AuditEntry).where(AuditEntry.action == "event_updated"))).scalars().all()
    assert any(
        {"title_en", "title_fr", "title_nl"} <= set(entry.details["fields_changed"])
        for entry in entries
        if entry.resource_id == event["id"]
    )


async def test_public_edition_resolves_text_for_the_requested_locale(client):
    event = await _translated_event(client, "edition-public-locale")
    plain = (await _post_event(client, event["edition_id"], title_nl="Alleen Nederlands")).json()
    assert plain["title_language"] == "nl"

    for locale, title, description in (
        ("nl", "Openingsavond", "Een glas om te starten"),
        ("fr", "Soirée d'ouverture", "Un verre pour commencer"),
        ("en", "Opening night", "Een glas om te starten"),  # no English description: the original is shown
    ):
        response = await client.get("/api/editions/upcoming", params={"locale": locale})
        assert response.status_code == 200
        events = {e["id"]: e for edition in response.json() for e in edition["events"]}
        assert (events[event["id"]]["title"], events[event["id"]]["description"]) == (title, description)
        # With only the original filled in, every locale shows the original.
        assert events[plain["id"]]["title"] == "Alleen Nederlands"

    default = await client.get("/api/editions/upcoming")
    default_events = {e["id"]: e for edition in default.json() for e in edition["events"]}
    assert default_events[event["id"]]["title"] == "Openingsavond"
    # Every stored language is public text, so the frontend can resolve without refetching.
    assert default_events[event["id"]]["title_en"] == "Opening night"

    assert (await client.get("/api/editions/upcoming", params={"locale": "de"})).status_code == 422


async def test_public_active_edition_accepts_the_locale(client):
    event = await _translated_event(client, "edition-active-locale")
    response = await client.get("/api/editions/active", params={"locale": "en"})
    assert response.status_code == 200
    assert [e["title"] for e in response.json()["events"] if e["id"] == event["id"]] == ["Opening night"]


async def test_server_rendered_home_and_json_ld_use_the_locale_text(client, monkeypatch):
    monkeypatch.setattr(settings, "frontend_dist_path", str(_FIXTURE_DIST))
    event = await _translated_event(client, "edition-render")
    plain = await _post_event(client, event["edition_id"], title_nl="Brunch")
    assert plain.status_code == 201

    for locale, title in (("nl", "Openingsavond"), ("fr", "Soirée d'ouverture"), ("en", "Opening night")):
        page = await client.get("/", params={"lng": locale})
        assert page.status_code == 200
        assert f"<li>{title} —" in page.text, locale
        ld = json.loads(page.text.split('data-ssr-jsonld="true">')[1].split("</script>")[0])
        names = {sub["name"] for sub in ld["subEvent"]}
        assert title in names

    # An event without a translation shows its original in every locale.
    for locale in ("nl", "fr", "en"):
        page = await client.get("/", params={"lng": locale})
        assert "Brunch" in page.text


async def test_the_database_enforces_the_original_language_and_category(db_session):
    from datetime import date

    from app.models import Edition, Venue

    db_session.add(Venue(id="venue-constraints", name="Venue"))
    await db_session.flush()
    db_session.add(Edition(id="edition-constraints", year=2099, month="march", venue_id="venue-constraints"))
    await db_session.flush()

    def event(**values):
        base = {
            "edition_id": "edition-constraints",
            "date": date(2099, 3, 21),
            "start_time": "10:00",
            "category": "tasting",
            "title_language": "nl",
            "title_nl": "Titel",
        }
        return Event(id=f"evt-{len(values)}-{id(values)}", **{**base, **values})

    for broken in (
        {"title_language": "fr"},  # no French text
        {"title_nl": "  "},
        {"description_language": "nl"},  # a language but no description
        {"description_fr": "Texte"},  # text but no language
        {"category": "gala"},
    ):
        with pytest.raises(IntegrityError):
            async with db_session.begin_nested():
                db_session.add(event(**broken))
                await db_session.flush()

    db_session.add(event(description_language="fr", description_fr="Texte"))
    await db_session.flush()


async def test_original_language_title_is_usable_in_sql(client, db_session):
    event = await _translated_event(client, "edition-sql-title")
    titles = (await db_session.execute(select(Event.title).where(Event.id == event["id"]))).scalars().all()
    assert titles == ["Openingsavond"]
    found = (
        await db_session.execute(select(func.count()).select_from(Event).where(Event.title.ilike("%opening%")))
    ).scalar_one()
    assert found >= 1
    await db_session.execute(text("SELECT 1"))


# --- translation drafts -----------------------------------------------------


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setattr(settings, "translation_service_url", "http://translation.local")
    monkeypatch.setattr(settings, "translation_languages", "nl,en")
    monkeypatch.setattr(translation, "_worker", asyncio.Lock())
    calls = []
    real_client = httpx.AsyncClient

    def handler(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={"translatedText": "Opening night"})

    def factory(**kwargs):
        return real_client(**kwargs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(translation.httpx, "AsyncClient", factory)
    return calls


async def test_event_translation_capabilities_and_draft_are_stateless(client, db_session, service):
    capabilities = await client.get("/api/events/translation", headers=ADMIN_HEADERS)
    assert capabilities.status_code == 200
    assert capabilities.json() == {"languages": ["nl", "en"]}
    assert capabilities.headers["cache-control"] == "no-store"

    body = {"text": "Openingsavond", "source": "nl", "target": "en"}
    draft = await client.post("/api/events/translation", json=body, headers=ADMIN_HEADERS)
    assert draft.status_code == 200
    assert draft.json() == {"text": "Opening night"}
    assert draft.headers["cache-control"] == "no-store"
    assert service == [{"q": "Openingsavond", "source": "nl", "target": "en", "format": "text"}]
    assert await db_session.scalar(select(func.count()).select_from(AuditEntry)) == 0


async def test_event_translation_requires_authentication(unauth_client, service):
    body = {"text": "Hallo", "source": "nl", "target": "en"}
    assert (await unauth_client.get("/api/events/translation")).status_code == 401
    assert (await unauth_client.post("/api/events/translation", json=body)).status_code == 401
    assert service == []


async def test_event_translation_draft_validates_text_and_languages(client, service):
    ok_long = {"text": "a" * translation.EVENT_TEXT_LIMIT, "source": "nl", "target": "en"}
    too_long = {**ok_long, "text": "a" * (translation.EVENT_TEXT_LIMIT + 1)}
    assert (await client.post("/api/events/translation", json=ok_long, headers=ADMIN_HEADERS)).status_code == 200
    assert (await client.post("/api/events/translation", json=too_long, headers=ADMIN_HEADERS)).status_code == 422
    same = {"text": "Hallo", "source": "nl", "target": "nl"}
    assert (await client.post("/api/events/translation", json=same, headers=ADMIN_HEADERS)).status_code == 422
    unsupported = {"text": "Hallo", "source": "nl", "target": "fr"}
    assert (await client.post("/api/events/translation", json=unsupported, headers=ADMIN_HEADERS)).status_code == 422


async def test_event_translation_has_its_own_rate_limit_bucket(client, service):
    body = {"text": "Hallo", "source": "nl", "target": "en"}
    for _ in range(5):
        assert (await client.post("/api/events/translation", json=body, headers=ADMIN_HEADERS)).status_code == 200
    limited = await client.post("/api/events/translation", json=body, headers=ADMIN_HEADERS)
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "600"
    # Organisation drafts keep their own allowance.
    other = await client.post("/api/organizations/translation", json=body, headers=ADMIN_HEADERS)
    assert other.status_code == 200
