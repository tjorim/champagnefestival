"""The ``ChampagneFestivalMcpBackend`` wrappers for the content and signage tools.

The per-module tests call ``app.mcp.admin.*`` directly; these go through the registered
wrappers so a mismatched keyword between the two layers, or a missing admin check, fails here.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from app.mcp_server import ChampagneFestivalMcpBackend
from app.models import Policy
from tests.helpers import _create_event, mcp_session_factory


@pytest.fixture
def admin_backend(db_session):
    backend = ChampagneFestivalMcpBackend(mcp_session_factory(db_session))
    with (
        patch.object(backend, "_resolve_role", return_value="admin"),
        patch.object(backend, "_actor", return_value="a"),
    ):
        yield backend


async def test_announcement_and_composer_wrappers(admin_backend):
    created = await admin_backend.create_announcement(
        text_nl="Welkom", link_url="https://example.com", link_label_nl="Meer"
    )
    updated = await admin_backend.update_announcement(created["id"], active=True, clear_link_url=True, link_label_nl="")
    assert updated["active"] is True
    assert updated["link_url"] is None
    second = await admin_backend.create_announcement(text_nl="Twee")
    reordered = await admin_backend.reorder_announcements([second["id"], created["id"]])
    assert reordered["announcements"][0]["id"] == second["id"]
    assert len((await admin_backend.list_announcements())["announcements"]) == 2
    assert (await admin_backend.delete_announcement(second["id"]))["deleted"] is True

    draft = await admin_backend.create_composed_message(channels=["announcement"], title_nl="Titel", body_nl="Bericht")
    edited = await admin_backend.update_composed_message(draft["id"], level="warning")
    assert edited["level"] == "warning"
    assert (await admin_backend.get_composed_message(draft["id"]))["state"] == "draft"
    assert len((await admin_backend.list_composed_messages())["messages"]) == 1
    assert (await admin_backend.schedule_composed_message(draft["id"]))["state"] == "scheduled"


async def test_policy_wrappers(admin_backend, db_session):
    db_session.add(Policy(key="privacy", title_language="nl", title_nl="Privacybeleid"))
    await db_session.commit()

    assert (await admin_backend.create_policy_draft("privacy"))["status"] == "draft"
    await admin_backend.update_policy_draft("privacy", content_nl="# Beleid")
    assert "<h2>Beleid</h2>" in (await admin_backend.preview_policy_markdown("## Beleid"))["html"]
    assert (await admin_backend.publish_policy_draft("privacy"))["status"] == "published"
    await admin_backend.create_policy_draft("privacy")
    assert (await admin_backend.discard_policy_draft("privacy"))["discarded"] is True
    assert (await admin_backend.get_policy("privacy"))["key"] == "privacy"
    assert len((await admin_backend.list_policies())["policies"]) == 1


async def test_signage_and_video_wrappers(admin_backend, client):
    await _create_event(client)
    channel = await admin_backend.create_signage_channel("hall", "Hall", "edition-public", active=True)
    template = await admin_backend.create_signage_template(
        "Default",
        layers=[{"id": key, "kind": "binding", "binding": key} for key in ("logo", "name", "sponsor", "title", "text")],
    )
    slide = await admin_backend.create_signage_slide(
        channel["id"], template["id"], "notice", active=True, content={"text": "Welkom"}
    )
    assert (await admin_backend.update_signage_slide(slide["id"], duration=30))["duration"] == 30
    assert (await admin_backend.update_signage_channel(channel["id"], name="Main"))["name"] == "Main"
    assert (await admin_backend.update_signage_template(template["id"], name="Renamed"))["name"] == "Renamed"
    assert (await admin_backend.get_signage_channel(channel["id"]))["slug"] == "hall"
    assert (await admin_backend.get_signage_template(template["id"]))["name"] == "Renamed"
    assert (await admin_backend.get_signage_slide(slide["id"]))["id"] == slide["id"]
    assert len((await admin_backend.list_signage_channels())["channels"]) == 1
    assert len((await admin_backend.list_signage_templates())["templates"]) == 1
    assert len((await admin_backend.list_signage_slides())["slides"]) == 1
    assert (await admin_backend.reorder_signage_slides(channel["id"], [slide["id"]]))["slides"][0]["id"] == slide["id"]
    assert (await admin_backend.get_signage_playlist("hall", "en"))["slides"][0]["text"] == "Welkom"
    assert "slides" in await admin_backend.preview_signage_playlist(
        {"slug": "x", "name": "X", "edition_id": "edition-public"}, [], datetime.now(UTC)
    )
    assert "available" in await admin_backend.get_signage_video_capability()
    assert (await admin_backend.list_signage_video_exports())["exports"] == []
    with pytest.raises(ValueError):
        await admin_backend.get_signage_video_export("missing")
    with pytest.raises(ValueError):
        await admin_backend.cancel_signage_video_export("missing")

    assert (await admin_backend.delete_signage_slide(slide["id"]))["deleted"] is True
    assert (await admin_backend.delete_signage_template(template["id"]))["deleted"] is True
    assert (await admin_backend.delete_signage_channel(channel["id"]))["deleted"] is True


async def test_waitlist_wrappers(admin_backend):
    assert (await admin_backend.list_waitlist_entries())["entries"] == []
    with pytest.raises(ValueError, match="not found"):
        await admin_backend.mark_waitlist_entry_handled("missing")
    with pytest.raises(ValueError, match="not found"):
        await admin_backend.delete_waitlist_entry("missing")


@pytest.mark.parametrize(
    "method,args",
    [
        ("create_announcement", {}),
        ("list_composed_messages", {}),
        ("publish_policy_draft", {"policy_key": "privacy"}),
        ("create_signage_channel", {"slug": "a", "name": "A", "edition_id": "e"}),
        ("list_waitlist_entries", {}),
        ("get_signage_video_capability", {}),
    ],
)
async def test_wrappers_refuse_non_admin_callers(db_session, method, args):
    backend = ChampagneFestivalMcpBackend(mcp_session_factory(db_session))
    with patch.object(backend, "_resolve_role", return_value="volunteer"), pytest.raises(PermissionError):
        await getattr(backend, method)(**args)
