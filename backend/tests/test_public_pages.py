"""Tests for #992's live-rendered GET / and GET /privacy.

Covers: shell-missing degradation, meta rewriting, FAQ/schedule/JSON-LD
content, XSS-safe escaping of admin-authored text, locale handling, the
TTL cache actually being consulted, and proactive NOTIFY-based invalidation
on a FAQ mutation.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.config import settings
from app.models import Policy
from tests.helpers import ADMIN_HEADERS, _create_event

_FIXTURE_DIST = Path(__file__).parent / "fixtures" / "frontend_dist"


@pytest.fixture(autouse=True)
def _use_fixture_shell(monkeypatch):
    monkeypatch.setattr(settings, "frontend_dist_path", str(_FIXTURE_DIST))


async def _seed_policy(db_session, *, key: str = "privacy") -> None:
    db_session.add(
        Policy(
            key=key,
            title_nl="Privacybeleid",
            title_en="Privacy Policy",
            title_fr="Politique de Confidentialité",
            required_locales="nl,en,fr",
        )
    )
    await db_session.commit()


async def _publish_policy(client, *, content_nl: str = "## Titel\n\nInhoud.") -> None:
    created = await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    assert created.status_code == 201
    await client.put(
        "/api/policies/privacy/draft",
        json={"content_nl": content_nl, "content_en": "## Title\n\nContent.", "content_fr": "## Titre\n\nContenu."},
        headers=ADMIN_HEADERS,
    )
    published = await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)
    assert published.status_code == 200


async def test_home_page_404s_when_frontend_build_is_missing(client, monkeypatch):
    monkeypatch.setattr(settings, "frontend_dist_path", "/nonexistent/path")
    r = await client.get("/")
    assert r.status_code == 404


async def test_privacy_page_404s_when_frontend_build_is_missing(client, monkeypatch):
    monkeypatch.setattr(settings, "frontend_dist_path", "/nonexistent/path")
    r = await client.get("/privacy")
    assert r.status_code == 404


async def test_home_page_renders_with_no_active_edition_and_no_faq(client):
    r = await client.get("/")
    assert r.status_code == 200
    assert "<!--ssr:head-->" not in r.text
    assert "<!--ssr:content-->" not in r.text
    assert r.headers["cache-control"] == "public, max-age=60"
    # No edition — no JSON-LD, but the site's own tagline still fills description.
    assert "application/ld+json" not in r.text
    assert 'content="Een viering van fijne champagne en gemeenschap"' in r.text


async def test_home_page_renders_faq_and_schedule_and_json_ld(client):
    await _create_event(client, title="Vrijdagavond", date="2099-03-21")
    faq = await client.post(
        "/api/faq",
        json={"question_nl": "Wat is dit?", "answer_nl": "Een champagnefestival.", "active": True},
        headers=ADMIN_HEADERS,
    )
    assert faq.status_code == 201

    r = await client.get("/")
    assert r.status_code == 200
    assert "Vrijdagavond" in r.text
    assert "Wat is dit?" in r.text
    assert "Een champagnefestival." in r.text
    assert 'data-ssr-jsonld="true"' in r.text
    assert '"@type":"Event"' in r.text


async def test_home_page_escapes_admin_authored_faq_content(client):
    r = await client.post(
        "/api/faq",
        json={
            "question_nl": "<script>alert('xss')</script>",
            "answer_nl": "Safe? <img src=x onerror=alert(1)>",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    page = await client.get("/")
    assert page.status_code == 200
    assert "<script>alert" not in page.text
    assert "&lt;script&gt;" in page.text
    assert "<img src=x" not in page.text


async def test_home_page_respects_locale_query_param(client):
    faq = await client.post(
        "/api/faq",
        json={
            "question_nl": "NL vraag",
            "answer_nl": "NL antwoord",
            "question_en": "EN question",
            "answer_en": "EN answer",
            "question_fr": "FR question",
            "answer_fr": "FR réponse",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert faq.status_code == 201

    r = await client.get("/?lng=en")
    assert r.status_code == 200
    assert 'html lang="en"' in r.text
    assert "EN question" in r.text
    assert "NL vraag" not in r.text
    assert 'content="A celebration of fine champagne and community"' in r.text

    r_fr = await client.get("/?lng=fr")
    assert r_fr.status_code == 200
    assert 'html lang="fr"' in r_fr.text
    assert "FR question" in r_fr.text
    assert 'content="Une célébration du champagne fin et de la communauté"' in r_fr.text


async def test_home_page_falls_back_to_dutch_for_an_unknown_locale(client):
    r = await client.get("/?lng=de")
    assert r.status_code == 200
    assert 'html lang="nl"' in r.text


async def test_privacy_page_404s_without_a_published_policy(client, db_session):
    await _seed_policy(db_session)
    r = await client.get("/privacy")
    assert r.status_code == 404


async def test_privacy_page_renders_published_markdown_content(client, db_session):
    await _seed_policy(db_session)
    await _publish_policy(client, content_nl="## Titel\n\nSome **bold** content.")

    r = await client.get("/")
    r_privacy = await client.get("/privacy")
    assert r_privacy.status_code == 200
    assert "<h2>Titel</h2>" in r_privacy.text
    assert "<strong>bold</strong>" in r_privacy.text
    assert "Privacybeleid" in r_privacy.text
    assert 'href="https://champagnefestival.tjor.im/privacy"' in r_privacy.text
    # Unrelated route's own render is unaffected.
    assert r.status_code == 200


async def test_home_page_is_served_from_cache_on_a_second_request(client, monkeypatch):
    import app.routers.public_pages as public_pages_module

    calls = 0
    original = public_pages_module._render_home

    async def counting_render(db, *, locale):
        nonlocal calls
        calls += 1
        return await original(db, locale=locale)

    monkeypatch.setattr(public_pages_module, "_render_home", counting_render)

    first = await client.get("/")
    second = await client.get("/")
    assert first.status_code == second.status_code == 200
    assert calls == 1


async def test_faq_mutation_invalidates_the_cache_within_the_ttl(client):
    """A real NOTIFY, relayed by the session-scoped pg_render_cache_listener
    fixture in conftest.py, must clear the cache — not just the in-process
    TTL expiring — so a create is reflected well within the 60s window.
    """
    first = await client.get("/")
    assert "Nieuwe FAQ vraag" not in first.text

    created = await client.post(
        "/api/faq",
        json={"question_nl": "Nieuwe FAQ vraag", "answer_nl": "Nieuw antwoord.", "active": True},
        headers=ADMIN_HEADERS,
    )
    assert created.status_code == 201

    for _ in range(40):
        page = await client.get("/")
        if "Nieuwe FAQ vraag" in page.text:
            break
        await asyncio.sleep(0.05)
    else:
        pytest.fail("Render cache was not invalidated by the FAQ mutation within the timeout.")


async def test_home_page_serves_last_known_good_render_on_a_database_failure(client, monkeypatch):
    """Acceptance criterion: a transient database failure must serve the
    last-known-good render rather than a 5xx on the public homepage."""
    import app.routers.public_pages as public_pages_module
    from app.services.public_render_cache import public_render_cache

    first = await client.get("/")
    assert first.status_code == 200

    # Force the cache entry to look expired without faking the process-wide
    # clock (see test_public_render_cache.py's own reasoning against
    # monkeypatching time.monotonic globally).
    for entry in public_render_cache._entries.values():
        entry.rendered_at = 0.0

    async def failing_render(db, *, locale):
        raise RuntimeError("database is unreachable")

    monkeypatch.setattr(public_pages_module, "_render_home", failing_render)

    second = await client.get("/")
    assert second.status_code == 200
    assert second.text == first.text
