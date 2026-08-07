"""Tests for the admin (write) people MCP tools."""

from __future__ import annotations

from datetime import date

import pytest

from app.mcp.admin import people as mcp_people
from app.models import Edition, Event, Registration, Venue
from tests.helpers import mcp_session_factory


async def test_create_get_person(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_people.create_person(factory, "admin-1", name="Alice", email="alice@example.com")
    assert created["name"] == "Alice"
    assert created["email"] == "alice@example.com"
    person_id = created["id"]

    fetched = await mcp_people.get_person(factory, person_id)
    assert fetched["id"] == person_id


async def test_create_person_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="name"):
        await mcp_people.create_person(factory, "admin-1", name="")  # min_length=1


async def test_get_person_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_people.get_person(factory, "nonexistent")


async def test_update_person_partial(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_people.create_person(factory, "admin-1", name="Alice", club_name="Old Club")

    updated = await mcp_people.update_person(factory, "admin-1", created["id"], club_name="New Club")
    assert updated["club_name"] == "New Club"
    assert updated["name"] == "Alice"  # untouched fields survive a partial update


async def test_update_person_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_people.update_person(factory, "admin-1", "nonexistent", club_name="New Club")


async def test_create_person_invalid_phone_rejected(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError):
        await mcp_people.create_person(factory, "admin-1", name="Bad Phone", phone="not-a-number")


async def test_create_person_national_register_number_conflict(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_people.create_person(factory, "admin-1", name="Alice", national_register_number="85010199999")

    with pytest.raises(ValueError, match="national register number"):
        await mcp_people.create_person(factory, "admin-1", name="Bob", national_register_number="85010199999")


async def test_create_person_eid_document_number_conflict(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_people.create_person(factory, "admin-1", name="Alice", eid_document_number="BEI998877")

    with pytest.raises(ValueError, match="eID document number"):
        await mcp_people.create_person(factory, "admin-1", name="Bob", eid_document_number="BEI998877")


async def test_update_person_national_register_number_conflict(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_people.create_person(factory, "admin-1", name="Alice", national_register_number="85010199999")
    bob = await mcp_people.create_person(factory, "admin-1", name="Bob")

    with pytest.raises(ValueError, match="national register number"):
        await mcp_people.update_person(factory, "admin-1", bob["id"], national_register_number="85010199999")


async def test_delete_person_cascades_registrations(db_session):
    factory = mcp_session_factory(db_session)
    person = await mcp_people.create_person(factory, "admin-1", name="Alice")

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
        Registration(id="reg-1", event_id="event-1", person_id=person["id"], guest_count=1, check_in_token="tok-1")
    )
    await db_session.commit()

    result = await mcp_people.delete_person(factory, "admin-1", person["id"])
    assert result == {"deleted": True, "id": person["id"]}

    remaining = await db_session.get(Registration, "reg-1")
    assert remaining is None

    with pytest.raises(ValueError, match="not found"):
        await mcp_people.get_person(factory, person["id"])


async def test_delete_person_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_people.delete_person(factory, "admin-1", "nonexistent")


async def test_merge_people_happy_path(db_session):
    factory = mcp_session_factory(db_session)
    canonical = await mcp_people.create_person(factory, "admin-1", name="Canon", email="canon@example.com", phone="")
    duplicate = await mcp_people.create_person(
        factory, "admin-1", name="Dup", email="dup@example.com", phone="+32470111222"
    )

    merged = await mcp_people.merge_people(factory, "admin-1", canonical["id"], duplicate["id"])
    assert merged["id"] == canonical["id"]
    assert merged["phone"] == "+32470111222"  # blank field filled from duplicate

    with pytest.raises(ValueError, match="not found"):
        await mcp_people.get_person(factory, duplicate["id"])


async def test_merge_people_adopts_duplicate_identity_fields(db_session):
    """When the canonical person lacks a national register / eID number but the
    duplicate has one, the canonical adopts it (the unique columns must be
    cleared on the duplicate first, since they can't both hold the value)."""
    factory = mcp_session_factory(db_session)
    canonical = await mcp_people.create_person(factory, "admin-1", name="Canon")
    duplicate = await mcp_people.create_person(
        factory,
        "admin-1",
        name="Dup",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
    )

    merged = await mcp_people.merge_people(factory, "admin-1", canonical["id"], duplicate["id"])
    assert merged["national_register_number"] == "85010199999"
    assert merged["eid_document_number"] == "bei998877"  # normalised to lowercase, like create/update

    # The duplicate is gone, so the unique columns it vacated stay usable.
    other = await mcp_people.create_person(factory, "admin-1", name="Other", national_register_number="11111111111")
    assert other["national_register_number"] == "11111111111"


async def test_merge_people_identity_conflict(db_session):
    factory = mcp_session_factory(db_session)
    a = await mcp_people.create_person(factory, "admin-1", name="A", national_register_number="12345")
    b = await mcp_people.create_person(factory, "admin-1", name="B", national_register_number="99999")

    with pytest.raises(ValueError, match="different"):
        await mcp_people.merge_people(factory, "admin-1", a["id"], b["id"])


async def test_merge_people_self(db_session):
    factory = mcp_session_factory(db_session)
    person = await mcp_people.create_person(factory, "admin-1", name="Alice")

    with pytest.raises(ValueError, match="themselves"):
        await mcp_people.merge_people(factory, "admin-1", person["id"], person["id"])
