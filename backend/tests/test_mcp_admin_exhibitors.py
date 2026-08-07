"""Tests for the admin (write) exhibitor MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import exhibitors as mcp_exhibitors
from app.models import Edition, Venue
from tests.helpers import mcp_session_factory


async def test_create_get_list_exhibitor(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_exhibitors.create_exhibitor(factory, "admin-1", name="Bollinger", type="producer")
    assert created["name"] == "Bollinger"
    assert created["type"] == "producer"
    exhibitor_id = created["id"]

    fetched = await mcp_exhibitors.get_exhibitor(factory, exhibitor_id)
    assert fetched["id"] == exhibitor_id

    listed = await mcp_exhibitors.list_exhibitors(factory)
    assert any(e["id"] == exhibitor_id for e in listed["exhibitors"])


async def test_create_exhibitor_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="name"):
        await mcp_exhibitors.create_exhibitor(factory, "admin-1", name="")  # min_length=1


async def test_get_exhibitor_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_exhibitors.get_exhibitor(factory, 999999)


async def test_update_exhibitor_partial(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_exhibitors.create_exhibitor(
        factory, "admin-1", name="Bollinger", website="https://old.example.com"
    )

    updated = await mcp_exhibitors.update_exhibitor(factory, "admin-1", created["id"], website="https://new.example.com")
    assert updated["website"] == "https://new.example.com"
    assert updated["name"] == "Bollinger"  # untouched fields survive a partial update


async def test_update_exhibitor_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_exhibitors.update_exhibitor(factory, "admin-1", 999999, website="https://new.example.com")


async def test_delete_exhibitor(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_exhibitors.create_exhibitor(factory, "admin-1", name="Bollinger")

    result = await mcp_exhibitors.delete_exhibitor(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_exhibitors.get_exhibitor(factory, created["id"])


async def test_exhibitor_contact_person(db_session):
    factory = mcp_session_factory(db_session)

    from app.mcp.admin import people as mcp_people

    person = await mcp_people.create_person(factory, "admin-1", name="Alice Contact")

    created = await mcp_exhibitors.create_exhibitor(
        factory, "admin-1", name="Fine Wines Ltd", type="vendor", contact_person_id=person["id"]
    )
    assert created["contact_person"]["name"] == "Alice Contact"
    assert created["contact_person_id"] == person["id"]

    updated = await mcp_exhibitors.update_exhibitor(
        factory, "admin-1", created["id"], clear_contact_person=True
    )
    assert updated["contact_person"] is None
    assert updated["contact_person_id"] is None


async def test_create_exhibitor_invalid_contact_person(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="Person not found"):
        await mcp_exhibitors.create_exhibitor(factory, "admin-1", name="Bad Corp", contact_person_id="nonexistent-id")


async def test_update_exhibitor_blocked_retype_to_vendor_while_linked(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_exhibitors.create_exhibitor(factory, "admin-1", name="Bollinger", type="producer")
    exhibitor_id = created["id"]

    db_session.add(Venue(id="venue-1", name="Test Venue"))
    await db_session.flush()
    db_session.add(
        Edition(id="edition-1", year=2099, month="march", venue_id="venue-1", exhibitors=[exhibitor_id])
    )
    await db_session.commit()

    with pytest.raises(ValueError, match="editions still link"):
        await mcp_exhibitors.update_exhibitor(factory, "admin-1", exhibitor_id, type="vendor")
