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
from app.models import AuditEntry, Event
from app.services import organization_translation as translation
from app.translations import resolve_text
from tests.conftest import DEFAULT_TEST_CATEGORIES
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
            "description_nl": "Een glas om te starten",
            "description_fr": "Un verre pour commencer",
        },
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_resolve_text_prefers_the_locale_then_dutch_and_ignores_blanks():
    values = {"nl": "Titel", "fr": "  ", "en": "Title"}
    assert resolve_text(values, "en") == "Title"
    assert resolve_text(values, "fr") == "Titel"
    assert resolve_text(values, None) == "Titel"
    assert resolve_text(values, "de") == "Titel"
    assert resolve_text({"nl": None, "fr": None, "en": None}, "en") == ""


async def test_create_accepts_translations_next_to_the_dutch_text(client):
    created = await _create_event(client, edition_id="edition-create-translated")
    response = await _post_event(
        client,
        created["edition_id"],
        title_nl="Degustatie",
        title_fr="Dégustation",
        title_en="Tasting",
        description_nl="Een avond",
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["title"] == "Degustatie"  # unresolved responses use Dutch
    assert (body["title_nl"], body["title_fr"], body["title_en"]) == ("Degustatie", "Dégustation", "Tasting")
    assert body["description"] == "Een avond"
    assert "title_language" not in body


@pytest.mark.parametrize(
    "overrides",
    [
        {},  # no title at all
        {"title": "Vrijdag"},  # a single-language title is not accepted any more
        {"title_nl": "Titel", "description": "Een avond"},
        {"title_fr": "Alleen Frans"},  # no Dutch title
        {"title_nl": "   "},
        {"title_nl": "Titel", "description_fr": "Texte"},  # a translated description without Dutch
        {"title_nl": "Titel", "title_language": "nl"},  # the original-language flag is gone
        {"title_nl": "x" * 201},
    ],
)
async def test_create_rejects_a_missing_or_inconsistent_dutch_text(client, overrides):
    created = await _create_event(client, edition_id="edition-create-invalid")
    response = await _post_event(client, created["edition_id"], **overrides)
    assert response.status_code == 422, response.text


async def test_the_category_must_be_an_existing_category(client):
    created = await _create_event(client, edition_id="edition-category")
    for category in DEFAULT_TEST_CATEGORIES:
        response = await _post_event(client, created["edition_id"], title_nl="Event", category=category)
        assert response.status_code == 201, (category, response.text)

    rejected = await _post_event(client, created["edition_id"], title_nl="Event", category="gala")
    assert rejected.status_code == 422
    assert "Unknown event category 'gala'" in rejected.text
    update = await client.put(f"/api/events/{created['id']}", json={"category": "gala"}, headers=ADMIN_HEADERS)
    assert update.status_code == 422
    listed = await client.get("/api/events", params={"category": "ceremony"}, headers=ADMIN_HEADERS)
    assert [event["category"] for event in listed.json()] == ["ceremony"]

    category = await client.post(
        "/api/event-categories", json={"key": "gala", "label_nl": "Gala"}, headers=ADMIN_HEADERS
    )
    assert category.status_code == 201
    accepted = await client.put(f"/api/events/{created['id']}", json={"category": "gala"}, headers=ADMIN_HEADERS)
    assert accepted.status_code == 200
    assert accepted.json()["category"] == "gala"


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
    assert "Dutch" in original.text

    unknown = await client.put(f"/api/events/{event['id']}", json={"title": "Legacy"}, headers=ADMIN_HEADERS)
    assert unknown.status_code == 422  # only the per-language fields are accepted


async def test_update_keeps_the_dutch_description_and_can_drop_the_whole_description(client):
    event = await _translated_event(client, "edition-update-original")

    old_shape = await client.put(f"/api/events/{event['id']}", json={"title_language": "fr"}, headers=ADMIN_HEADERS)
    assert old_shape.status_code == 422  # the original-language flag is gone

    no_dutch = await client.put(f"/api/events/{event['id']}", json={"description_nl": ""}, headers=ADMIN_HEADERS)
    assert no_dutch.status_code == 422  # a French description remains, so Dutch is required

    dropped = await client.put(
        f"/api/events/{event['id']}",
        json={"description_nl": "", "description_fr": ""},
        headers=ADMIN_HEADERS,
    )
    assert dropped.status_code == 200, dropped.text
    assert dropped.json()["description"] == ""


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
    assert plain["title_nl"] == "Alleen Nederlands"

    for locale, title, description in (
        ("nl", "Openingsavond", "Een glas om te starten"),
        ("fr", "Soirée d'ouverture", "Un verre pour commencer"),
        ("en", "Opening night", "Een glas om te starten"),  # no English description: Dutch is shown
    ):
        response = await client.get("/api/editions/upcoming", params={"locale": locale})
        assert response.status_code == 200
        events = {e["id"]: e for edition in response.json() for e in edition["events"]}
        assert (events[event["id"]]["title"], events[event["id"]]["description"]) == (title, description)
        # With only Dutch filled in, every locale shows it.
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

    # An event without a translation shows its Dutch text in every locale.
    for locale in ("nl", "fr", "en"):
        page = await client.get("/", params={"lng": locale})
        assert "Brunch" in page.text


async def test_the_database_enforces_dutch_text_and_the_category(db_session):
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
            "title_nl": "Titel",
        }
        return Event(id=f"evt-{len(values)}-{id(values)}", **{**base, **values})

    for broken in (
        {"title_nl": "  "},
        {"title_nl": None},
        {"description_fr": "Texte"},  # a translated description without Dutch
        {"category": "gala"},  # no such category
    ):
        with pytest.raises(IntegrityError):
            async with db_session.begin_nested():
                db_session.add(event(**broken))
                await db_session.flush()

    db_session.add(event(description_nl="Tekst", description_fr="Texte"))
    await db_session.flush()


async def test_dutch_title_is_usable_in_sql(client, db_session):
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
