"""Tests for the admin (write) volunteer MCP tools."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.mcp.admin import volunteers as mcp_volunteers
from app.models import Person, VolunteerPeriod
from tests.helpers import mcp_session_factory

HELP_PERIODS = [{"first_help_day": "2099-03-21", "last_help_day": "2099-03-22"}]


async def test_create_get_list_volunteer(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        help_periods=HELP_PERIODS,
    )
    assert created["name"] == "Alice"
    assert len(created["help_periods"]) == 1
    assert str(created["help_periods"][0]["first_help_day"]) == "2099-03-21"
    volunteer_id = created["id"]

    fetched = await mcp_volunteers.get_volunteer(factory, volunteer_id)
    assert fetched["id"] == volunteer_id
    assert len(fetched["help_periods"]) == 1

    listed = await mcp_volunteers.list_volunteers(factory)
    assert any(v["id"] == volunteer_id for v in listed["volunteers"])


async def test_create_volunteer_requires_at_least_one_help_period(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="help_periods"):
        await mcp_volunteers.create_volunteer(
            factory,
            "admin-1",
            name="Alice",
            national_register_number="85010199999",
            eid_document_number="BEI998877",
            help_periods=[],
        )


async def test_create_volunteer_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="name"):
        await mcp_volunteers.create_volunteer(
            factory,
            "admin-1",
            name="",  # min_length=1
            national_register_number="85010199999",
            eid_document_number="BEI998877",
            help_periods=HELP_PERIODS,
        )


async def test_get_volunteer_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_volunteers.get_volunteer(factory, "nonexistent")


async def test_get_volunteer_not_found_for_non_volunteer_person(db_session):
    """A Person without the 'volunteer' role is not reachable via the volunteer tools."""
    from app.mcp.admin import people as mcp_people

    factory = mcp_session_factory(db_session)
    person = await mcp_people.create_person(factory, "admin-1", name="Not A Volunteer")

    with pytest.raises(ValueError, match="not found"):
        await mcp_volunteers.get_volunteer(factory, person["id"])


async def test_update_volunteer_partial(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        address="Old Address",
        help_periods=HELP_PERIODS,
    )

    updated = await mcp_volunteers.update_volunteer(factory, "admin-1", created["id"], address="New Address")
    assert updated["address"] == "New Address"
    assert updated["name"] == "Alice"  # untouched fields survive a partial update
    assert len(updated["help_periods"]) == 1  # untouched help periods survive too


async def test_update_volunteer_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_volunteers.update_volunteer(factory, "admin-1", "nonexistent", address="New Address")


async def test_update_volunteer_replaces_help_periods(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        help_periods=HELP_PERIODS,
    )

    new_periods = [{"first_help_day": "2099-04-01", "last_help_day": None}]
    updated = await mcp_volunteers.update_volunteer(factory, "admin-1", created["id"], help_periods=new_periods)
    assert len(updated["help_periods"]) == 1
    assert str(updated["help_periods"][0]["first_help_day"]) == "2099-04-01"
    assert updated["help_periods"][0]["last_help_day"] is None


async def test_create_volunteer_national_register_number_conflict(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        help_periods=HELP_PERIODS,
    )

    with pytest.raises(ValueError, match="national register number"):
        await mcp_volunteers.create_volunteer(
            factory,
            "admin-1",
            name="Bob",
            national_register_number="85010199999",
            eid_document_number="BEI111222",
            help_periods=HELP_PERIODS,
        )


async def test_update_volunteer_eid_document_number_conflict(db_session):
    factory = mcp_session_factory(db_session)
    await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        help_periods=HELP_PERIODS,
    )
    bob = await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Bob",
        national_register_number="85010111111",
        eid_document_number="BEI111222",
        help_periods=HELP_PERIODS,
    )

    with pytest.raises(ValueError, match="eID document number"):
        await mcp_volunteers.update_volunteer(factory, "admin-1", bob["id"], eid_document_number="BEI998877")


async def test_delete_volunteer_removes_role_and_periods_but_keeps_person(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        help_periods=HELP_PERIODS,
    )
    volunteer_id = created["id"]

    result = await mcp_volunteers.delete_volunteer(factory, "admin-1", volunteer_id)
    assert result == {"deleted": True, "id": volunteer_id}

    with pytest.raises(ValueError, match="not found"):
        await mcp_volunteers.get_volunteer(factory, volunteer_id)

    person = await db_session.get(Person, volunteer_id)
    assert person is not None
    assert "volunteer" not in person.roles

    periods = (
        (await db_session.execute(select(VolunteerPeriod).where(VolunteerPeriod.volunteer_id == volunteer_id)))
        .scalars()
        .all()
    )
    assert periods == []


async def test_delete_volunteer_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_volunteers.delete_volunteer(factory, "admin-1", "nonexistent")
