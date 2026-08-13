"""Tests for the admin (write) FAQ item MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import faq as mcp_faq
from tests.helpers import mcp_session_factory


async def test_create_list_faq_item(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_faq.create_faq_item(
        factory, "admin-1", question_nl="Vraag?", answer_nl="Antwoord.", question_en="Question?", answer_en="Answer."
    )
    assert created["question_nl"] == "Vraag?"
    assert created["question_en"] == "Question?"
    assert created["question_fr"] is None

    listed = await mcp_faq.list_faq_items(factory)
    assert any(item["id"] == created["id"] for item in listed["faq_items"])


async def test_update_faq_item_clears_optional_locale_with_empty_string(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_faq.create_faq_item(
        factory, "admin-1", question_nl="Vraag?", answer_nl="Antwoord.", question_en="Question?", answer_en="Answer."
    )

    updated = await mcp_faq.update_faq_item(factory, "admin-1", created["id"], question_en="", answer_en="")
    assert updated["question_en"] is None
    assert updated["answer_en"] is None
    assert updated["question_nl"] == "Vraag?"  # untouched fields survive a partial update


async def test_create_faq_item_rejects_empty_question_nl(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="question_nl"):
        await mcp_faq.create_faq_item(factory, "admin-1", question_nl="", answer_nl="Antwoord.")  # min_length=1


async def test_update_faq_item_rejects_empty_question_nl(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_faq.create_faq_item(factory, "admin-1", question_nl="Vraag?", answer_nl="Antwoord.")

    with pytest.raises(ValueError, match="question_nl"):
        await mcp_faq.update_faq_item(factory, "admin-1", created["id"], question_nl="")  # min_length=1


async def test_update_faq_item_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_faq.update_faq_item(factory, "admin-1", "nonexistent", question_nl="x")


async def test_delete_faq_item(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_faq.create_faq_item(factory, "admin-1", question_nl="Vraag?", answer_nl="Antwoord.")

    result = await mcp_faq.delete_faq_item(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    listed = await mcp_faq.list_faq_items(factory)
    assert not any(item["id"] == created["id"] for item in listed["faq_items"])


async def test_delete_faq_item_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_faq.delete_faq_item(factory, "admin-1", "nonexistent")


async def test_create_faq_item_appends_after_the_current_last_item(db_session):
    factory = mcp_session_factory(db_session)
    first = await mcp_faq.create_faq_item(factory, "admin-1", question_nl="Vraag 1?", answer_nl="Antwoord 1.")
    second = await mcp_faq.create_faq_item(factory, "admin-1", question_nl="Vraag 2?", answer_nl="Antwoord 2.")
    assert second["sort_order"] > first["sort_order"]


async def test_reorder_faq_items(db_session):
    factory = mcp_session_factory(db_session)
    first = await mcp_faq.create_faq_item(factory, "admin-1", question_nl="Vraag 1?", answer_nl="Antwoord 1.")
    second = await mcp_faq.create_faq_item(factory, "admin-1", question_nl="Vraag 2?", answer_nl="Antwoord 2.")

    reordered = await mcp_faq.reorder_faq_items(factory, "admin-1", ordered_ids=[second["id"], first["id"]])
    assert [item["id"] for item in reordered["faq_items"]] == [second["id"], first["id"]]
    assert reordered["faq_items"][0]["sort_order"] < reordered["faq_items"][1]["sort_order"]


async def test_reorder_faq_items_rejects_stale_list(db_session):
    factory = mcp_session_factory(db_session)
    first = await mcp_faq.create_faq_item(factory, "admin-1", question_nl="Vraag 1?", answer_nl="Antwoord 1.")
    await mcp_faq.create_faq_item(factory, "admin-1", question_nl="Vraag 2?", answer_nl="Antwoord 2.")

    with pytest.raises(ValueError, match="stale"):
        await mcp_faq.reorder_faq_items(factory, "admin-1", ordered_ids=[first["id"]])
