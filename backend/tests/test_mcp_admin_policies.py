"""Tests for the admin MCP tools for the policy draft/publish workflow."""

from __future__ import annotations

import pytest

from app.mcp.admin import policies as mcp_policies
from app.models import Policy
from tests.helpers import mcp_session_factory


async def _seed(db_session, key: str = "privacy") -> None:
    db_session.add(Policy(key=key, title_language="nl", title_nl="Privacybeleid", title_en="Privacy Policy"))
    await db_session.commit()


async def test_list_and_get_policy(db_session):
    await _seed(db_session)
    factory = mcp_session_factory(db_session)

    listed = await mcp_policies.list_policies(factory)
    assert [policy["key"] for policy in listed["policies"]] == ["privacy"]
    assert (await mcp_policies.get_policy(factory, "privacy"))["title_nl"] == "Privacybeleid"
    with pytest.raises(ValueError, match="not found"):
        await mcp_policies.get_policy(factory, "missing")


async def test_draft_edit_publish_and_rollback_workflow(db_session):
    await _seed(db_session)
    factory = mcp_session_factory(db_session)

    draft = await mcp_policies.create_policy_draft(factory, "admin-1", "privacy")
    assert draft["status"] == "draft"
    assert draft["content_language"] == "nl"
    with pytest.raises(ValueError, match="already has an open draft"):
        await mcp_policies.create_policy_draft(factory, "admin-1", "privacy")

    edited = await mcp_policies.update_policy_draft(
        factory, "admin-1", "privacy", content_nl="# Beleid", change_summary="Eerste versie"
    )
    assert edited["content_nl"] == "# Beleid"
    assert edited["change_summary"] == "Eerste versie"

    published = await mcp_policies.publish_policy_draft(factory, "admin-1", "privacy")
    assert published["status"] == "published"
    assert published["version_number"] == 1

    second = await mcp_policies.create_policy_draft(factory, "admin-1", "privacy")
    assert second["content_nl"] == "# Beleid"
    await mcp_policies.update_policy_draft(factory, "admin-1", "privacy", content_nl="# Nieuw", content_en="# New")
    await mcp_policies.publish_policy_draft(factory, "admin-1", "privacy")

    rollback = await mcp_policies.create_policy_draft(factory, "admin-1", "privacy", source_version_number=1)
    assert rollback["content_nl"] == "# Beleid"
    assert rollback["content_en"] is None
    versions = (await mcp_policies.get_policy(factory, "privacy"))["versions"]
    assert {v["version_number"]: v["status"] for v in versions} == {1: "superseded", 2: "published", 3: "draft"}


async def test_publish_requires_text_in_the_original_language(db_session):
    await _seed(db_session)
    factory = mcp_session_factory(db_session)
    await mcp_policies.create_policy_draft(factory, "admin-1", "privacy")
    await mcp_policies.update_policy_draft(factory, "admin-1", "privacy", content_en="# English only")

    with pytest.raises(ValueError, match="original language 'nl'"):
        await mcp_policies.publish_policy_draft(factory, "admin-1", "privacy")


async def test_discard_policy_draft(db_session):
    await _seed(db_session)
    factory = mcp_session_factory(db_session)
    await mcp_policies.create_policy_draft(factory, "admin-1", "privacy")

    assert await mcp_policies.discard_policy_draft(factory, "admin-1", "privacy") == {
        "discarded": True,
        "policy_key": "privacy",
    }
    with pytest.raises(ValueError, match="no open draft"):
        await mcp_policies.update_policy_draft(factory, "admin-1", "privacy", content_nl="x")
    with pytest.raises(ValueError, match="not found"):
        await mcp_policies.create_policy_draft(factory, "admin-1", "missing")


async def test_preview_policy_markdown_uses_the_public_renderer():
    result = await mcp_policies.preview_policy_markdown("## Titel\n\n<script>alert(1)</script>")

    assert "<h2>Titel</h2>" in result["html"]
    assert "<script" not in result["html"]
