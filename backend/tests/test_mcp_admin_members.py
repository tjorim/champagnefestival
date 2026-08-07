"""Tests for the admin (write) member MCP tools."""

from __future__ import annotations

from datetime import date

import pytest

from app.mcp.admin import members as mcp_members
from app.models import Edition, Event, Registration, Venue
from tests.helpers import mcp_session_factory


async def test_create_get_list_member(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_members.create_member(factory, "admin-1", name="Alice", email="alice@example.com")
    assert created["name"] == "Alice"
    assert "member" in created["roles"]
    member_id = created["id"]

    fetched = await mcp_members.get_member(factory, member_id)
    assert fetched["id"] == member_id

    listed = await mcp_members.list_members(factory)
    assert any(m["id"] == member_id for m in listed["members"])


async def test_create_member_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="name"):
        await mcp_members.create_member(factory, "admin-1", name="")  # min_length=1


async def test_get_member_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_members.get_member(factory, "nonexistent")


async def test_get_member_not_found_for_non_member_person(db_session):
    """A Person without the 'member' role is not reachable via the member tools."""
    from app.mcp.admin import people as mcp_people

    factory = mcp_session_factory(db_session)
    person = await mcp_people.create_person(factory, "admin-1", name="Not A Member")

    with pytest.raises(ValueError, match="not found"):
        await mcp_members.get_member(factory, person["id"])


async def test_update_member_partial(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_members.create_member(factory, "admin-1", name="Alice", club_name="Old Club")

    updated = await mcp_members.update_member(factory, "admin-1", created["id"], club_name="New Club")
    assert updated["club_name"] == "New Club"
    assert updated["name"] == "Alice"  # untouched fields survive a partial update


async def test_update_member_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_members.update_member(factory, "admin-1", "nonexistent", club_name="New Club")


async def test_update_member_cannot_remove_member_role(db_session):
    """_ensure_member_role re-adds 'member' even if the caller submits a roles
    list that omits it — a member can't demote itself to a non-member Person."""
    factory = mcp_session_factory(db_session)
    created = await mcp_members.create_member(factory, "admin-1", name="Alice")

    updated = await mcp_members.update_member(factory, "admin-1", created["id"], roles=["volunteer"])
    assert set(updated["roles"]) == {"member", "volunteer"}


async def test_list_members_filters_by_active(db_session):
    factory = mcp_session_factory(db_session)
    active_member = await mcp_members.create_member(factory, "admin-1", name="Active Alice", active=True)
    inactive_member = await mcp_members.create_member(factory, "admin-1", name="Inactive Ivan", active=False)

    active_only = await mcp_members.list_members(factory, active=True)
    ids = [m["id"] for m in active_only["members"]]
    assert active_member["id"] in ids
    assert inactive_member["id"] not in ids

    inactive_only = await mcp_members.list_members(factory, active=False)
    ids = [m["id"] for m in inactive_only["members"]]
    assert inactive_member["id"] in ids
    assert active_member["id"] not in ids


async def test_list_members_filters_by_query(db_session):
    factory = mcp_session_factory(db_session)
    alice = await mcp_members.create_member(factory, "admin-1", name="Alice Champagne", email="alice@example.com")
    await mcp_members.create_member(factory, "admin-1", name="Bob Bubbles", email="bob@example.com")

    matched = await mcp_members.list_members(factory, q="champagne")
    ids = [m["id"] for m in matched["members"]]
    assert alice["id"] in ids
    assert len(matched["members"]) == 1


async def test_member_phone_is_normalised_to_e164(db_session):
    """Phone numbers submitted in local format are normalised the same way people.py does."""
    factory = mcp_session_factory(db_session)

    created = await mcp_members.create_member(factory, "admin-1", name="Local Format", phone="0475555111")
    assert created["phone"] == "+32475555111"

    updated = await mcp_members.update_member(factory, "admin-1", created["id"], phone="0499000000")
    assert updated["phone"] == "+32499000000"


async def test_create_member_invalid_phone_rejected(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="[Pp]hone"):
        await mcp_members.create_member(factory, "admin-1", name="Bad Phone", phone="not-a-phone-number")


async def test_create_member_national_register_number_conflict(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_members.create_member(factory, "admin-1", name="Alice", national_register_number="85010199999")

    with pytest.raises(ValueError, match="national register number"):
        await mcp_members.create_member(factory, "admin-1", name="Bob", national_register_number="85010199999")


async def test_update_member_eid_document_number_conflict(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_members.create_member(factory, "admin-1", name="Alice", eid_document_number="BEI998877")
    bob = await mcp_members.create_member(factory, "admin-1", name="Bob")

    with pytest.raises(ValueError, match="eID document number"):
        await mcp_members.update_member(factory, "admin-1", bob["id"], eid_document_number="BEI998877")


async def test_delete_member_cascades_registrations(db_session):
    factory = mcp_session_factory(db_session)
    member = await mcp_members.create_member(factory, "admin-1", name="Alice")

    db_session.add(Venue(id="venue-1", name="Test Venue"))
    await db_session.flush()
    db_session.add(Edition(id="edition-1", year=2099, month="march", venue_id="venue-1"))
    await db_session.flush()
    db_session.add(
        Event(
            id="event-1",
            edition_id="edition-1",
            title="Vrijdagavond",
            date=date(2099, 3, 21),
            start_time="18:00",
            category="festival",
        )
    )
    await db_session.flush()
    db_session.add(
        Registration(id="reg-1", event_id="event-1", person_id=member["id"], guest_count=1, check_in_token="tok-1")
    )
    await db_session.commit()

    result = await mcp_members.delete_member(factory, "admin-1", member["id"])
    assert result == {"deleted": True, "id": member["id"]}

    remaining = await db_session.get(Registration, "reg-1")
    assert remaining is None

    with pytest.raises(ValueError, match="not found"):
        await mcp_members.get_member(factory, member["id"])


async def test_delete_member_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_members.delete_member(factory, "admin-1", "nonexistent")
