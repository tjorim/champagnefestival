"""Tests for the admin MCP tools for digital signage, its video exports and playlists."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.auth import get_actor_id
from app.config import settings
from app.main import app
from app.mcp.admin import signage as mcp_signage
from app.mcp.admin import signage_video as mcp_video
from app.models import AuditEntry
from tests.helpers import _create_event, mcp_session_factory
from tests.test_signage_video import new_job

LAYERS = [{"id": key, "kind": "binding", "binding": key} for key in ("logo", "name", "sponsor", "title", "text")]


async def _channel_and_template(client, db_session, factory):
    await _create_event(client)
    channel = await mcp_signage.create_signage_channel(
        factory, "admin-1", slug="hall", name="Hall", edition_id="edition-public", active=True
    )
    template = await mcp_signage.create_signage_template(factory, "admin-1", name="Default", layers=LAYERS)
    return channel, template


async def test_channel_crud_and_partial_update(client, db_session):
    factory = mcp_session_factory(db_session)
    channel, _ = await _channel_and_template(client, db_session, factory)

    assert channel["slug"] == "hall"
    assert (await mcp_signage.get_signage_channel(factory, channel["id"]))["name"] == "Hall"
    assert [c["id"] for c in (await mcp_signage.list_signage_channels(factory))["channels"]] == [channel["id"]]

    updated = await mcp_signage.update_signage_channel(factory, "admin-1", channel["id"], name="Main hall")
    assert updated["name"] == "Main hall"
    assert updated["slug"] == "hall"  # omitted fields survive
    assert updated["active"] is True

    with pytest.raises(ValueError, match="slug"):
        await mcp_signage.update_signage_channel(factory, "admin-1", channel["id"], slug="Not A Slug")
    with pytest.raises(ValueError, match="Edition not found"):
        await mcp_signage.create_signage_channel(factory, "admin-1", slug="x", name="X", edition_id="missing")
    with pytest.raises(ValueError, match="not found"):
        await mcp_signage.get_signage_channel(factory, "missing")

    assert await mcp_signage.delete_signage_channel(factory, "admin-1", channel["id"]) == {
        "deleted": True,
        "id": channel["id"],
    }
    actions = set((await db_session.scalars(select(AuditEntry.resource_type))).all())
    assert "signage_channels" in actions


async def test_template_update_replaces_documents_and_guards_placeholders(client, db_session):
    factory = mcp_session_factory(db_session)
    channel, template = await _channel_and_template(client, db_session, factory)
    await mcp_signage.create_signage_slide(
        factory, "admin-1", channel_id=channel["id"], template_id=template["id"], kind="notice", content={"text": "Hi"}
    )

    renamed = await mcp_signage.update_signage_template(factory, "admin-1", template["id"], name="Renamed")
    assert renamed["name"] == "Renamed"
    assert [layer["id"] for layer in renamed["layers"]] == [layer["id"] for layer in LAYERS]

    with pytest.raises(ValueError, match="placeholders required by existing slides"):
        await mcp_signage.update_signage_template(factory, "admin-1", template["id"], layers=[])
    with pytest.raises(ValueError, match="layer ids must be unique"):
        await mcp_signage.create_signage_template(factory, "admin-1", name="Dup", layers=LAYERS[:1] * 2)
    with pytest.raises(ValueError, match="still in use"):
        await mcp_signage.delete_signage_template(factory, "admin-1", template["id"])
    assert len((await mcp_signage.list_signage_templates(factory))["templates"]) == 1
    assert (await mcp_signage.get_signage_template(factory, template["id"]))["name"] == "Renamed"


async def test_slide_lifecycle_schedule_clearing_and_reorder(client, db_session):
    factory = mcp_session_factory(db_session)
    channel, template = await _channel_and_template(client, db_session, factory)
    start = datetime.now(UTC) + timedelta(hours=1)

    first = await mcp_signage.create_signage_slide(
        factory,
        "admin-1",
        channel_id=channel["id"],
        template_id=template["id"],
        kind="notice",
        active=True,
        starts_at=start,
        ends_at=start + timedelta(hours=1),
        content={"title": "Hello", "text": "Welkom"},
    )
    second = await mcp_signage.create_signage_slide(
        factory, "admin-1", channel_id=channel["id"], template_id=template["id"], kind="organizations"
    )
    assert first["duration"] == 10
    assert first["active"] is True
    assert second["active"] is False

    cleared = await mcp_signage.update_signage_slide(
        factory, "admin-1", first["id"], duration=20, clear_starts_at=True, clear_ends_at=True
    )
    assert cleared["duration"] == 20
    assert cleared["starts_at"] is None
    assert cleared["ends_at"] is None
    assert cleared["content"]["text"] == "Welkom"

    reordered = await mcp_signage.reorder_signage_slides(
        factory, "admin-1", channel["id"], ordered_ids=[second["id"], first["id"]]
    )
    assert [slide["id"] for slide in reordered["slides"]] == [second["id"], first["id"]]
    assert (await mcp_signage.get_signage_slide(factory, first["id"]))["id"] == first["id"]
    assert len((await mcp_signage.list_signage_slides(factory))["slides"]) == 2
    with pytest.raises(ValueError, match="every slide"):
        await mcp_signage.reorder_signage_slides(factory, "admin-1", channel["id"], ordered_ids=[first["id"]])

    assert (await mcp_signage.delete_signage_slide(factory, "admin-1", second["id"]))["deleted"] is True


async def test_slide_validation_matches_the_rest_api(client, db_session):
    factory = mcp_session_factory(db_session)
    channel, template = await _channel_and_template(client, db_session, factory)
    ids = {"channel_id": channel["id"], "template_id": template["id"]}

    with pytest.raises(ValueError, match="notice requires text"):
        await mcp_signage.create_signage_slide(factory, "admin-1", kind="notice", **ids)
    with pytest.raises(ValueError, match="uploaded image"):
        await mcp_signage.create_signage_slide(factory, "admin-1", kind="image", **ids)
    with pytest.raises(ValueError, match="timezone"):
        await mcp_signage.create_signage_slide(
            factory, "admin-1", kind="organizations", starts_at=datetime(2099, 1, 1), **ids
        )
    with pytest.raises(ValueError, match="Upload the image before referencing it"):
        await mcp_signage.create_signage_slide(
            factory, "admin-1", kind="image", content={"image": f"/uploads/signage/{'a' * 32}-{'b' * 64}.jpg"}, **ids
        )
    with pytest.raises(ValueError, match="not found"):
        await mcp_signage.create_signage_slide(
            factory, "admin-1", kind="organizations", channel_id="missing", template_id=template["id"]
        )


async def test_playlist_and_preview_follow_the_stored_and_unsaved_documents(client, db_session):
    factory = mcp_session_factory(db_session)
    channel, template = await _channel_and_template(client, db_session, factory)
    await mcp_signage.create_signage_slide(
        factory,
        "admin-1",
        channel_id=channel["id"],
        template_id=template["id"],
        kind="notice",
        active=True,
        content={"title": "Hallo", "text": "Welkom"},
    )

    playlist = await mcp_signage.get_signage_playlist(factory, "hall")
    assert [slide["text"] for slide in playlist["slides"]] == ["Welkom"]
    with pytest.raises(ValueError, match="Channel not found"):
        await mcp_signage.get_signage_playlist(factory, "missing")

    preview = await mcp_signage.preview_signage_playlist(
        factory,
        channel={"slug": "draft", "name": "Draft", "edition_id": "edition-public", "active": True},
        slides=[
            {
                "channel_id": channel["id"],
                "template_id": template["id"],
                "kind": "notice",
                "active": True,
                "content": {"text": "Voorbeeld"},
            }
        ],
        at=datetime.now(UTC),
    )
    assert [slide["text"] for slide in preview["slides"]] == ["Voorbeeld"]
    with pytest.raises(ValueError, match="timezone"):
        await mcp_signage.preview_signage_playlist(factory, channel={}, slides=[], at=datetime(2099, 1, 1))


@pytest.fixture
async def configured_video(client, monkeypatch, tmp_path):
    secret = tmp_path / "token"
    secret.write_text("x" * 64)
    monkeypatch.setattr(settings, "media_worker_url", "http://media-worker:8090")
    monkeypatch.setattr(settings, "media_worker_token_file", str(secret))
    monkeypatch.setattr(settings, "signage_video_storage", str(tmp_path / "private"))
    app.dependency_overrides[get_actor_id] = lambda: "admin-a"
    yield


async def test_video_capability_reports_configuration(monkeypatch):
    monkeypatch.setattr(settings, "media_worker_url", "")

    capability = await mcp_video.get_signage_video_capability()

    assert capability["available"] is False
    assert capability["max_slides"] > 0
    assert capability["max_seconds"] > 0


async def test_video_exports_are_listed_read_and_cancelled_per_creator(client, db_session, configured_video):
    job, _, _ = await new_job(client, db_session)
    factory = mcp_session_factory(db_session)

    listed = await mcp_video.list_signage_video_exports(factory, "admin-a")
    assert [item["id"] for item in listed["exports"]] == [job["id"]]
    assert (await mcp_video.get_signage_video_export(factory, "admin-a", job["id"]))["state"] == "preparing"

    # Jobs belong to their creator: another admin sees nothing and cannot touch them.
    assert (await mcp_video.list_signage_video_exports(factory, "admin-b"))["exports"] == []
    with pytest.raises(ValueError, match="could not be completed"):
        await mcp_video.get_signage_video_export(factory, "admin-b", job["id"])
    with pytest.raises(ValueError, match="could not be completed"):
        await mcp_video.cancel_signage_video_export(factory, "admin-b", job["id"])

    cancelled = await mcp_video.cancel_signage_video_export(factory, "admin-a", job["id"])
    assert cancelled["state"] == "cancelled"
    assert cancelled["cancel_requested"] is True
