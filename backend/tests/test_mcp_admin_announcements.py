"""Tests for the admin MCP tools for announcements and the central composer."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import select

from app.mcp.admin import announcements as mcp_announcements
from app.mcp.admin import composer as mcp_composer
from app.models import AuditEntry
from tests.helpers import mcp_session_factory


async def test_announcement_is_created_in_dutch_and_starts_inactive(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_announcements.create_announcement(factory, "admin-1", text_nl="Welkom")

    assert created["text_nl"] == "Welkom"
    assert created["active"] is False
    assert created["published_at"] is None
    listed = await mcp_announcements.list_announcements(factory)
    assert [item["id"] for item in listed["announcements"]] == [created["id"]]


async def test_announcement_requires_dutch_text(db_session):
    factory = mcp_session_factory(db_session)

    with pytest.raises(ValueError, match="Dutch"):
        await mcp_announcements.create_announcement(factory, "admin-1", text_en="Welcome")


async def test_update_announcement_partially_updates_and_publishes(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_announcements.create_announcement(
        factory, "admin-1", text_nl="Welkom", text_en="Welcome", link_url="https://example.com", link_label_nl="Meer"
    )

    updated = await mcp_announcements.update_announcement(
        factory, "admin-1", created["id"], active=True, text_en="", clear_link_url=True, link_label_nl=""
    )

    assert updated["active"] is True
    assert updated["published_by"] == "admin-1"
    assert updated["text_nl"] == "Welkom"
    assert updated["text_en"] is None
    assert updated["link_url"] is None
    actions = set((await db_session.scalars(select(AuditEntry.action))).all())
    assert {"announcement_created", "announcement_updated", "announcement_published"} <= actions


async def test_update_announcement_rejects_clearing_the_dutch_text(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_announcements.create_announcement(factory, "admin-1", text_nl="Welkom")

    with pytest.raises(ValueError, match="Dutch"):
        await mcp_announcements.update_announcement(factory, "admin-1", created["id"], text_nl="")


async def test_update_announcement_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_announcements.update_announcement(factory, "admin-1", "missing", active=True)


async def test_announcement_window_must_carry_a_timezone_and_end_after_it_starts(db_session):
    factory = mcp_session_factory(db_session)
    now = datetime.now(UTC)

    with pytest.raises(ValueError, match="timezone"):
        await mcp_announcements.create_announcement(
            factory, "admin-1", text_nl="Welkom", starts_at=datetime(2099, 1, 1)
        )
    with pytest.raises(ValueError, match="ends_at"):
        await mcp_announcements.create_announcement(
            factory, "admin-1", text_nl="Welkom", starts_at=now, ends_at=now - timedelta(hours=1)
        )


async def test_reorder_and_delete_announcements(db_session):
    factory = mcp_session_factory(db_session)
    first = await mcp_announcements.create_announcement(factory, "admin-1", text_nl="Een")
    second = await mcp_announcements.create_announcement(factory, "admin-1", text_nl="Twee")

    reordered = await mcp_announcements.reorder_announcements(
        factory, "admin-1", ordered_ids=[second["id"], first["id"]]
    )
    assert [item["id"] for item in reordered["announcements"]] == [second["id"], first["id"]]

    with pytest.raises(ValueError, match="every announcement"):
        await mcp_announcements.reorder_announcements(factory, "admin-1", ordered_ids=[first["id"]])

    assert await mcp_announcements.delete_announcement(factory, "admin-1", first["id"]) == {
        "deleted": True,
        "id": first["id"],
    }
    with pytest.raises(ValueError, match="not found"):
        await mcp_announcements.delete_announcement(factory, "admin-1", first["id"])


async def _draft(factory, **overrides: Any):
    fields: dict[str, Any] = {"channels": ["announcement"], "title_nl": "Titel", "body_nl": "Bericht"}
    return await mcp_composer.create_composed_message(factory, "admin-1", **{**fields, **overrides})


async def test_composed_message_is_a_draft_that_can_be_listed_and_fetched(db_session):
    factory = mcp_session_factory(db_session)

    created = await _draft(factory)

    assert created["title_nl"] == "Titel"
    assert created["state"] == "draft"
    assert (await mcp_composer.get_composed_message(factory, created["id"]))["id"] == created["id"]
    listed = await mcp_composer.list_composed_messages(factory)
    assert [item["id"] for item in listed["messages"]] == [created["id"]]
    with pytest.raises(ValueError, match="not found"):
        await mcp_composer.get_composed_message(factory, "missing")


async def test_composed_message_needs_a_complete_dutch_pair(db_session):
    factory = mcp_session_factory(db_session)

    with pytest.raises(ValueError, match="Dutch title"):
        await _draft(factory, body_nl=None, body_en="Message")
    with pytest.raises(ValueError, match="channels"):
        await _draft(factory, channels=[])


async def test_update_composed_message_merges_and_rejects_non_drafts(db_session):
    factory = mcp_session_factory(db_session)
    created = await _draft(factory)

    updated = await mcp_composer.update_composed_message(
        factory, "admin-1", created["id"], title_en="Title", body_en="Message", level="urgent"
    )
    assert updated["title_nl"] == "Titel"
    assert updated["title_en"] == "Title"
    assert updated["level"] == "urgent"

    await mcp_composer.schedule_composed_message(factory, "admin-1", created["id"])
    with pytest.raises(ValueError, match="no longer a draft"):
        await mcp_composer.update_composed_message(factory, "admin-1", created["id"], title_nl="Nieuw")


async def test_schedule_composed_message_enqueues_once(db_session):
    factory = mcp_session_factory(db_session)
    created = await _draft(factory)
    when = datetime.now(UTC) + timedelta(hours=1)

    scheduled = await mcp_composer.schedule_composed_message(factory, "admin-1", created["id"], scheduled_at=when)

    assert scheduled["state"] == "scheduled"
    assert scheduled["scheduled_at"] == when
    with pytest.raises(ValueError, match="already been scheduled"):
        await mcp_composer.schedule_composed_message(factory, "admin-1", created["id"])
    with pytest.raises(ValueError, match="timezone"):
        await mcp_composer.schedule_composed_message(
            factory, "admin-1", created["id"], scheduled_at=datetime(2099, 1, 1)
        )


async def test_schedule_composed_message_is_rate_limited(db_session, monkeypatch):
    factory = mcp_session_factory(db_session)
    created = await _draft(factory)
    monkeypatch.setattr(mcp_composer, "check_rate_limit", lambda *args, **kwargs: False)

    with pytest.raises(ValueError, match="Too many requests"):
        await mcp_composer.schedule_composed_message(factory, "admin-1", created["id"])


async def test_clear_flags_remove_the_window_ends_and_the_composer_link(db_session):
    factory = mcp_session_factory(db_session)
    start = datetime.now(UTC) + timedelta(days=1)
    announcement = await mcp_announcements.create_announcement(
        factory, "admin-1", text_nl="Welkom", starts_at=start, ends_at=start + timedelta(days=1)
    )
    cleared = await mcp_announcements.update_announcement(
        factory, "admin-1", announcement["id"], clear_starts_at=True, clear_ends_at=True
    )
    assert cleared["starts_at"] is None
    assert cleared["ends_at"] is None

    message = await _draft(factory, link_url="https://example.com/info")
    assert message["link_url"] == "https://example.com/info"
    cleared_message = await mcp_composer.update_composed_message(factory, "admin-1", message["id"], clear_link_url=True)
    assert cleared_message["link_url"] is None
