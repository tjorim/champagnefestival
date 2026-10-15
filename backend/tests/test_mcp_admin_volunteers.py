"""Tests for the admin (write) volunteer MCP tools."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.mcp.admin import volunteers as mcp_volunteers
from app.models import AuditEntry, Person, VolunteerPeriod
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


async def test_update_volunteer_can_set_and_clear_oidc_subject(db_session):
    """clear_oidc_subject is required to unlink — passing oidc_subject=None is a no-op,
    since it's indistinguishable from omitting the parameter entirely (#1037 review)."""
    factory = mcp_session_factory(db_session)
    created = await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        help_periods=HELP_PERIODS,
    )

    linked = await mcp_volunteers.update_volunteer(factory, "admin-1", created["id"], oidc_subject="keycloak-sub-123")
    assert linked["oidc_subject"] == "keycloak-sub-123"

    unchanged = await mcp_volunteers.update_volunteer(factory, "admin-1", created["id"], oidc_subject=None)
    assert unchanged["oidc_subject"] == "keycloak-sub-123"

    unlinked = await mcp_volunteers.update_volunteer(factory, "admin-1", created["id"], clear_oidc_subject=True)
    assert unlinked["oidc_subject"] is None


async def test_update_volunteer_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_volunteers.update_volunteer(factory, "admin-1", "nonexistent", address="New Address")


async def test_create_and_update_volunteer_round_trips_period_notes(db_session):
    """notes is a free-text, admin-only rough schedule/notepad per period —
    deliberately unstructured, not a role/task model."""
    factory = mcp_session_factory(db_session)
    created = await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        help_periods=[{"first_help_day": "2099-03-21", "last_help_day": "2099-03-22", "notes": "Fri: bar"}],
    )
    assert created["help_periods"][0]["notes"] == "Fri: bar"

    updated = await mcp_volunteers.update_volunteer(
        factory,
        "admin-1",
        created["id"],
        help_periods=[{"first_help_day": "2099-04-01", "last_help_day": None, "notes": "Sat: serving"}],
    )
    assert updated["help_periods"][0]["notes"] == "Sat: serving"


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


async def test_deactivate_volunteer_keeps_everything(db_session):
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

    result = await mcp_volunteers.deactivate_volunteer(factory, "admin-1", volunteer_id)
    assert result == {"ended": True, "id": volunteer_id}

    # Still a volunteer record, with the role retired (not removed), and the person intact ...
    still = await mcp_volunteers.get_volunteer(factory, volunteer_id)
    assert still["id"] == volunteer_id
    assert still["anonymised"] is False
    assert still["retired_roles"] == {"volunteer": date.today().isoformat()}
    person = await db_session.get(Person, volunteer_id)
    assert person is not None
    assert "volunteer" in person.roles
    inactive = await mcp_volunteers.list_volunteers(factory, active=False)
    assert [v["id"] for v in inactive["volunteers"]] == [volunteer_id]

    # ... and the help periods are history (insurance) that survives stepping back.
    periods = (
        (await db_session.execute(select(VolunteerPeriod).where(VolunteerPeriod.volunteer_id == volunteer_id)))
        .scalars()
        .all()
    )
    assert [(p.first_help_day.isoformat(), p.last_help_day.isoformat()) for p in periods] == [
        ("2099-03-21", "2099-03-22")
    ]
    entry = await db_session.scalar(select(AuditEntry).where(AuditEntry.action == "volunteer_deactivated"))
    assert entry is not None and entry.resource_id == volunteer_id

    # Ending again changes nothing and writes no second audit entry.
    assert await mcp_volunteers.deactivate_volunteer(factory, "admin-1", volunteer_id) == result
    entries = (await db_session.scalars(select(AuditEntry).where(AuditEntry.action == "volunteer_deactivated"))).all()
    assert len(entries) == 1


async def test_deactivate_volunteer_closes_open_periods(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        help_periods=[
            {"first_help_day": "2020-03-21", "last_help_day": None},
            {"first_help_day": "2099-03-21", "last_help_day": None},
        ],
    )
    volunteer_id = created["id"]

    await mcp_volunteers.deactivate_volunteer(factory, "admin-1", volunteer_id)

    periods = (
        (
            await db_session.execute(
                select(VolunteerPeriod)
                .where(VolunteerPeriod.volunteer_id == volunteer_id)
                .order_by(VolunteerPeriod.first_help_day)
            )
        )
        .scalars()
        .all()
    )
    assert len(periods) == 2
    # An open period ends today; one that had not started closes on its first day.
    assert periods[0].last_help_day == date.today()
    assert periods[1].last_help_day == periods[1].first_help_day


async def test_deactivate_volunteer_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_volunteers.deactivate_volunteer(factory, "admin-1", "nonexistent")


async def test_reactivate_volunteer_restores_the_role_without_reopening_periods(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_volunteers.create_volunteer(
        factory,
        "admin-1",
        name="Alice",
        national_register_number="85010199999",
        eid_document_number="BEI998877",
        help_periods=[{"first_help_day": "2020-03-21", "last_help_day": None}],
    )
    volunteer_id = created["id"]
    await mcp_volunteers.deactivate_volunteer(factory, "admin-1", volunteer_id)
    assert (await mcp_volunteers.list_volunteers(factory, active=True))["volunteers"] == []

    result = await mcp_volunteers.reactivate_volunteer(factory, "admin-1", volunteer_id)
    assert result == {"reactivated": True, "id": volunteer_id}
    listed = (await mcp_volunteers.list_volunteers(factory, active=True))["volunteers"]
    assert [v["id"] for v in listed] == [volunteer_id]
    # The period that was closed on deactivation stays closed.
    assert listed[0]["help_periods"][0]["last_help_day"] == date.today()
    assert listed[0]["retired_roles"] == {}

    assert await mcp_volunteers.reactivate_volunteer(factory, "admin-1", volunteer_id) == result
    entries = (await db_session.scalars(select(AuditEntry).where(AuditEntry.action == "volunteer_reactivated"))).all()
    assert len(entries) == 1
