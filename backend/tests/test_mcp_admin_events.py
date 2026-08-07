"""Tests for the admin (write) event MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import events as mcp_events
from app.models import Edition, Venue
from tests.helpers import mcp_session_factory


async def _create_edition(db_session, *, edition_type: str = "festival", edition_id: str = "edition-1") -> str:
    venue = Venue(id="venue-1", name="Test Venue")
    db_session.add(venue)
    await db_session.flush()
    edition = Edition(id=edition_id, year=2099, month="march", venue_id=venue.id, edition_type=edition_type)
    db_session.add(edition)
    await db_session.flush()
    return edition.id


async def test_create_get_event(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)

    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title="Friday Tasting",
        date="2099-03-21",
        start_time="18:00",
        category="festival",
    )
    assert created["title"] == "Friday Tasting"
    assert created["edition_id"] == edition_id
    assert created["edition"]["id"] == edition_id

    fetched = await mcp_events.get_event(factory, created["id"])
    assert fetched["id"] == created["id"]
    assert fetched["title"] == "Friday Tasting"


async def test_create_event_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)

    with pytest.raises(ValueError, match="start_time"):
        await mcp_events.create_event(
            factory,
            "admin-1",
            edition_id=edition_id,
            title="Bad Event",
            date="2099-03-21",
            start_time="99:99",  # invalid HH:MM pattern
            category="festival",
        )


async def test_get_event_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_events.get_event(factory, "nonexistent")


async def test_update_event_partial(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title="Friday Tasting",
        date="2099-03-21",
        start_time="18:00",
        category="festival",
    )

    updated = await mcp_events.update_event(factory, "admin-1", created["id"], title="Friday Tasting Updated")
    assert updated["title"] == "Friday Tasting Updated"
    assert updated["category"] == "festival"  # untouched fields survive a partial update
    assert str(updated["date"]) == "2099-03-21"


async def test_update_event_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_events.update_event(factory, "admin-1", "nonexistent", title="New Title")


async def test_delete_event(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title="Friday Tasting",
        date="2099-03-21",
        start_time="18:00",
        category="festival",
    )

    result = await mcp_events.delete_event(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_events.get_event(factory, created["id"])


async def test_standalone_edition_rejects_a_second_date(db_session):
    """Off-festival editions may only span a single calendar date."""
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session, edition_type="bourse", edition_id="edition-bourse")

    await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title="Bourse Opening",
        date="2099-03-21",
        start_time="10:00",
        category="exchange",
    )

    with pytest.raises(ValueError, match="single date"):
        await mcp_events.create_event(
            factory,
            "admin-1",
            edition_id=edition_id,
            title="Bourse Auction",
            date="2099-03-22",
            start_time="10:00",
            category="exchange",
        )


async def test_standalone_edition_allows_moving_within_same_single_day(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session, edition_type="bourse", edition_id="edition-bourse-move")

    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title="Bourse Opening",
        date="2099-03-21",
        start_time="10:00",
        category="exchange",
    )

    updated = await mcp_events.update_event(factory, "admin-1", created["id"], date="2099-03-21", title="Updated")
    assert str(updated["date"]) == "2099-03-21"


async def test_create_event_rejects_registration_settings_without_registration_required(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)

    with pytest.raises(ValueError, match="registration_required"):
        await mcp_events.create_event(
            factory,
            "admin-1",
            edition_id=edition_id,
            title="Walk-in Only Event",
            date="2099-03-21",
            start_time="18:00",
            category="festival",
            registration_required=False,
            max_capacity=10,
        )


async def test_update_event_rejects_registration_settings_without_registration_required(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title="Walk-in Only Event",
        date="2099-03-21",
        start_time="18:00",
        category="festival",
        registration_required=False,
    )

    with pytest.raises(ValueError, match="registration_required"):
        await mcp_events.update_event(factory, "admin-1", created["id"], max_capacity=10)


async def test_update_event_clears_nullable_fields(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title="Friday Tasting",
        date="2099-03-21",
        start_time="18:00",
        end_time="22:00",
        category="festival",
        registration_required=True,
        registrations_open_from="2026-01-01T00:00:00+00:00",
        max_capacity=50,
    )
    assert created["end_time"] == "22:00"
    assert created["max_capacity"] == 50
    assert created["registrations_open_from"] is not None

    updated = await mcp_events.update_event(
        factory,
        "admin-1",
        created["id"],
        clear_end_time=True,
        clear_registrations_open_from=True,
        clear_max_capacity=True,
    )
    assert updated["end_time"] is None
    assert updated["max_capacity"] is None
    assert updated["registrations_open_from"] is None
    assert updated["title"] == "Friday Tasting"  # untouched fields survive a partial update
