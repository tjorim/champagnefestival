"""Versioned policy draft/publish workflow, locale enforcement, and sanitization tests."""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import AuditEntry, Policy, PolicyVersion
from app.schemas import PolicyDraftCreate, PolicyDraftUpdate
from app.services.errors import ServiceError
from app.services.policies_service import create_draft, publish_draft, update_draft
from app.services.policy_markdown import render_markdown
from tests.helpers import ADMIN_HEADERS


async def _seed_policy(db_session, *, key: str = "privacy", required_locales: str = "nl,en,fr") -> None:
    db_session.add(
        Policy(
            key=key,
            title_nl="Privacybeleid",
            title_en="Privacy Policy",
            title_fr="Politique de Confidentialité",
            required_locales=required_locales,
        )
    )
    await db_session.commit()


# ---------------------------------------------------------------------------
# Markdown rendering / sanitization — no DB needed.
# ---------------------------------------------------------------------------


def test_render_markdown_supports_the_explicit_subset():
    html = render_markdown("## Heading\n\nSome **bold** and _italic_ text with a [link](https://example.com).")
    assert "<h2>Heading</h2>" in html
    assert "<strong>bold</strong>" in html
    assert "<em>italic</em>" in html
    assert '<a href="https://example.com" rel="noopener noreferrer nofollow">link</a>' in html


@pytest.mark.parametrize(
    "markdown,forbidden",
    [
        # Raw HTML is never interpreted (markdown-it has html:False) and nh3
        # sanitizes defense-in-depth — either way, no live tag ever survives.
        ("<script>alert(1)</script>", "<script"),
        ("<img src=x onerror=alert(1)>", "<img"),
        ("<iframe src='https://evil.example'></iframe>", "<iframe"),
        ("<a href='https://example.com' onclick='evil()'>x</a>", "<a "),
    ],
)
def test_render_markdown_never_emits_a_live_unsafe_tag(markdown, forbidden):
    html = render_markdown(markdown)
    assert forbidden not in html
    assert "<script" not in html
    assert "<iframe" not in html


def test_render_markdown_rejects_unsafe_link_schemes():
    html = render_markdown("[click me](javascript:alert(1))")
    # markdown-it's link validator refuses the javascript: scheme, so the
    # bracket syntax never becomes a real <a href> at all.
    assert "href" not in html
    assert "<a " not in html


def test_render_markdown_does_not_emit_reserved_h1():
    html = render_markdown("# Reserved h1\n\ntext")
    assert "<h1>" not in html


def test_render_markdown_handles_blank_and_none_source():
    assert render_markdown(None) == ""
    assert render_markdown("") == ""


@pytest.mark.parametrize(
    "markdown",
    [
        "**unterminated bold",
        "[broken link(",
        "```\nunterminated code fence",
        "### \n\n> \n\n- \n- \n\n" + "#" * 500,
        "\x00\x01 control chars ﻿",
    ],
)
def test_render_markdown_never_raises_on_malformed_input(markdown):
    # CommonMark parsers are error-tolerant by design; this just documents
    # that garbled admin input can never 500 the render/preview endpoints.
    render_markdown(markdown)


# ---------------------------------------------------------------------------
# Draft lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_edit_and_publish_draft_from_scratch(client, db_session):
    await _seed_policy(db_session)
    created = await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    assert created.status_code == 201
    draft = created.json()
    assert draft["status"] == "draft"
    assert draft["version_number"] == 1
    assert draft["content_nl"] is None

    updated = await client.put(
        "/api/policies/privacy/draft",
        json={"content_nl": "## Titel\n\nInhoud.", "content_en": "## Title\n\nContent.", "content_fr": "## Titre\n\nContenu."},
        headers=ADMIN_HEADERS,
    )
    assert updated.status_code == 200
    assert updated.json()["content_nl"] == "## Titel\n\nInhoud."

    published = await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)
    assert published.status_code == 200
    body = published.json()
    assert body["status"] == "published"
    assert body["published_by"] is not None
    assert body["published_at"] is not None

    public = await client.get("/api/policies/privacy/current", params={"locale": "nl"})
    assert public.status_code == 200
    assert "<h2>Titel</h2>" in public.json()["html"]
    assert public.json()["version_number"] == 1

    actions = set((await db_session.execute(select(AuditEntry.action))).scalars())
    assert {"policy_draft_created", "policy_draft_updated", "policy_published"} <= actions


@pytest.mark.anyio
async def test_publish_refused_when_required_locale_missing(client, db_session):
    await _seed_policy(db_session, required_locales="nl,en,fr")
    await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    await client.put(
        "/api/policies/privacy/draft",
        json={"content_nl": "Alleen NL."},
        headers=ADMIN_HEADERS,
    )
    response = await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)
    assert response.status_code == 400
    assert "en" in response.json()["detail"] and "fr" in response.json()["detail"]


@pytest.mark.anyio
async def test_only_one_open_draft_at_a_time(client, db_session):
    await _seed_policy(db_session)
    first = await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    assert first.status_code == 201
    second = await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    assert second.status_code == 409


@pytest.mark.anyio
async def test_published_versions_are_immutable_and_historical_versions_remain_inspectable(client, db_session):
    await _seed_policy(db_session, required_locales="nl")
    await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    await client.put("/api/policies/privacy/draft", json={"content_nl": "V1"}, headers=ADMIN_HEADERS)
    v1 = (await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)).json()

    # No draft remains open after publishing — editing "the draft" now 404s,
    # which is what keeps a published version immutable.
    edit_after_publish = await client.put(
        "/api/policies/privacy/draft", json={"content_nl": "tampered"}, headers=ADMIN_HEADERS
    )
    assert edit_after_publish.status_code == 404

    await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    await client.put("/api/policies/privacy/draft", json={"content_nl": "V2"}, headers=ADMIN_HEADERS)
    v2 = (await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)).json()
    assert v2["version_number"] == v1["version_number"] + 1

    detail = (await client.get("/api/policies/privacy", headers=ADMIN_HEADERS)).json()
    statuses_by_version = {v["version_number"]: v["status"] for v in detail["versions"]}
    assert statuses_by_version[v1["version_number"]] == "superseded"
    assert statuses_by_version[v2["version_number"]] == "published"
    # The superseded version's content is still there, unmutated.
    superseded_content = next(v for v in detail["versions"] if v["version_number"] == v1["version_number"])
    assert superseded_content["content_nl"] == "V1"

    public = await client.get("/api/policies/privacy/current", params={"locale": "nl"})
    assert "V2" in public.json()["html"]


@pytest.mark.anyio
async def test_rollback_seeds_a_new_draft_from_an_older_version(client, db_session):
    await _seed_policy(db_session, required_locales="nl")
    await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    await client.put("/api/policies/privacy/draft", json={"content_nl": "Original"}, headers=ADMIN_HEADERS)
    v1 = (await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)).json()

    await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    await client.put("/api/policies/privacy/draft", json={"content_nl": "Mistake"}, headers=ADMIN_HEADERS)
    await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)

    rollback_draft = await client.post(
        "/api/policies/privacy/draft", json={"source_version_number": v1["version_number"]}, headers=ADMIN_HEADERS
    )
    assert rollback_draft.status_code == 201
    assert rollback_draft.json()["content_nl"] == "Original"
    v3 = await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)
    assert v3.json()["version_number"] == 3

    public = await client.get("/api/policies/privacy/current", params={"locale": "nl"})
    assert "Original" in public.json()["html"]


@pytest.mark.anyio
async def test_discard_draft_without_publishing(client, db_session):
    await _seed_policy(db_session)
    await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    response = await client.delete("/api/policies/privacy/draft", headers=ADMIN_HEADERS)
    assert response.status_code == 204
    again = await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    assert again.status_code == 201
    assert again.json()["version_number"] == 1  # discarded draft's number is not reused, but none was consumed either


# ---------------------------------------------------------------------------
# Locale publication requirements
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_public_endpoint_never_silently_serves_another_locale(client, db_session):
    await _seed_policy(db_session, required_locales="nl,en")
    await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    await client.put(
        "/api/policies/privacy/draft",
        json={"content_nl": "Nederlands", "content_en": "English"},
        headers=ADMIN_HEADERS,
    )
    publish = await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)
    assert publish.status_code == 200

    assert (await client.get("/api/policies/privacy/current", params={"locale": "nl"})).status_code == 200
    assert (await client.get("/api/policies/privacy/current", params={"locale": "en"})).status_code == 200
    # French was never required/provided — must 404, not silently fall back to nl/en.
    missing = await client.get("/api/policies/privacy/current", params={"locale": "fr"})
    assert missing.status_code == 404


# ---------------------------------------------------------------------------
# Preview uses the same renderer/sanitizer as public output
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_preview_endpoint_matches_public_rendering(client, db_session):
    await _seed_policy(db_session, required_locales="nl")
    markdown = "## Preview\n\n<script>bad()</script> Some *text*."
    preview = await client.post("/api/policies/render", json={"markdown": markdown}, headers=ADMIN_HEADERS)
    assert preview.status_code == 200
    assert preview.json()["html"] == render_markdown(markdown)

    await client.post("/api/policies/privacy/draft", json={}, headers=ADMIN_HEADERS)
    await client.put("/api/policies/privacy/draft", json={"content_nl": markdown}, headers=ADMIN_HEADERS)
    await client.post("/api/policies/privacy/draft/publish", headers=ADMIN_HEADERS)
    public = await client.get("/api/policies/privacy/current", params={"locale": "nl"})
    assert public.json()["html"] == preview.json()["html"]


# ---------------------------------------------------------------------------
# Concurrency: a row lock protects atomic publication.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_concurrent_publish_attempts_do_not_double_publish(engine):
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async with sessions() as setup:
        await _seed_policy(setup, required_locales="nl")
        await create_draft(setup, actor="admin-a", policy_key="privacy", body=PolicyDraftCreate(), request_id=None)
        await update_draft(
            setup,
            actor="admin-a",
            policy_key="privacy",
            body=PolicyDraftUpdate(content_nl="Race content"),
            request_id=None,
        )

    async def attempt(actor: str):
        async with sessions() as session:
            try:
                return await publish_draft(session, actor=actor, policy_key="privacy", request_id=None)
            except ServiceError as exc:
                return exc

    results = await asyncio.gather(attempt("admin-a"), attempt("admin-b"))
    succeeded = [r for r in results if isinstance(r, dict)]
    failed = [r for r in results if isinstance(r, ServiceError)]
    assert len(succeeded) == 1
    assert len(failed) == 1
    assert failed[0].status_code == 404  # the loser finds no open draft left to publish

    async with sessions() as verify:
        published = (
            await verify.execute(
                select(PolicyVersion).where(PolicyVersion.policy_key == "privacy", PolicyVersion.status == "published")
            )
        ).scalars().all()
    assert len(published) == 1
