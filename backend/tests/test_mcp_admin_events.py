"""Tests for the admin (write) event MCP tools."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.mcp.admin import events as mcp_events
from app.mcp.admin import people as mcp_people
from app.mcp.utils import MCPToolError
from app.models import Edition, Registration, Venue
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
        title_en="Friday Tasting",
        date=date(2099, 3, 21),
        start_time="18:00",
        category="general",
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
            title_en="Bad Event",
            date=date(2099, 3, 21),
            start_time="99:99",  # invalid HH:MM pattern
            category="general",
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
        title_en="Friday Tasting",
        date=date(2099, 3, 21),
        start_time="18:00",
        category="general",
    )

    updated = await mcp_events.update_event(factory, "admin-1", created["id"], title_en="Friday Tasting Updated")
    assert updated["title"] == "Friday Tasting Updated"
    assert updated["category"] == "general"  # untouched fields survive a partial update
    assert str(updated["date"]) == "2099-03-21"


async def test_update_event_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_events.update_event(factory, "admin-1", "nonexistent", title_en="New Title")


async def test_delete_event(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title_en="Friday Tasting",
        date=date(2099, 3, 21),
        start_time="18:00",
        category="general",
    )

    result = await mcp_events.delete_event(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_events.get_event(factory, created["id"])


async def test_delete_event_rejects_when_registrations_exist(db_session):
    """A blocking registration must produce a clean conflict message, not a raw DB error.

    Regression test: without a pre-check, ``db.delete(event)`` reached the database and
    raised a raw ``NotNullViolationError`` (the ORM has no cascade for `event.registrations`,
    so it tried to null out the non-nullable `registrations.event_id`), which surfaced driver
    internals, SQL, and the full registration row (including its check-in token) to the caller.
    """
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title_en="Friday Tasting",
        date=date(2099, 3, 21),
        start_time="18:00",
        category="general",
    )
    person = await mcp_people.create_person(factory, "admin-1", name="Alice")
    db_session.add(
        Registration(
            id="reg-1",
            event_id=created["id"],
            person_id=person["id"],
            guest_count=1,
            check_in_token="super-secret-token",
        )
    )
    await db_session.commit()

    with pytest.raises(ValueError) as exc_info:
        await mcp_events.delete_event(factory, "admin-1", created["id"])

    # Must be the FastMCP-aware error type, not a plain ValueError — that's what
    # lets the sanitized message reach the caller unmodified instead of being
    # wrapped/masked by FastMCP's generic exception handling (see MCPToolError).
    assert isinstance(exc_info.value, MCPToolError)
    message = str(exc_info.value)
    assert "1 registration" in message
    assert "super-secret-token" not in message
    assert "IntegrityError" not in message
    assert "NotNullViolation" not in message

    # the event and its registration must both survive the rejected delete
    assert await db_session.get(Registration, "reg-1") is not None
    fetched = await mcp_events.get_event(factory, created["id"])
    assert fetched["id"] == created["id"]


async def test_standalone_edition_rejects_a_second_date(db_session):
    """Off-festival editions may only span a single calendar date."""
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session, edition_type="bourse", edition_id="edition-bourse")

    await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title_en="Bourse Opening",
        date=date(2099, 3, 21),
        start_time="10:00",
        category="exchange",
    )

    with pytest.raises(ValueError, match="single date"):
        await mcp_events.create_event(
            factory,
            "admin-1",
            edition_id=edition_id,
            title_en="Bourse Auction",
            date=date(2099, 3, 22),
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
        title_en="Bourse Opening",
        date=date(2099, 3, 21),
        start_time="10:00",
        category="exchange",
    )

    updated = await mcp_events.update_event(
        factory, "admin-1", created["id"], date=date(2099, 3, 21), title_en="Updated"
    )
    assert str(updated["date"]) == "2099-03-21"


async def test_create_event_rejects_registration_settings_without_registration_required(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)

    with pytest.raises(ValueError, match="registration_required"):
        await mcp_events.create_event(
            factory,
            "admin-1",
            edition_id=edition_id,
            title_en="Walk-in Only Event",
            date=date(2099, 3, 21),
            start_time="18:00",
            category="general",
            registration_required=False,
            registrations_open_from=datetime(2026, 1, 1, tzinfo=UTC),
        )


async def test_update_event_rejects_registration_settings_without_registration_required(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title_en="Walk-in Only Event",
        date=date(2099, 3, 21),
        start_time="18:00",
        category="general",
        registration_required=False,
    )

    with pytest.raises(ValueError, match="registration_required"):
        await mcp_events.update_event(
            factory, "admin-1", created["id"], registrations_open_from=datetime(2026, 1, 1, tzinfo=UTC)
        )


async def test_update_event_clears_nullable_fields(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title_en="Friday Tasting",
        date=date(2099, 3, 21),
        start_time="18:00",
        end_time="22:00",
        category="general",
        registration_required=True,
        registrations_open_from=datetime(2026, 1, 1, tzinfo=UTC),
    )
    assert created["end_time"] == "22:00"
    assert created["registrations_open_from"] is not None

    updated = await mcp_events.update_event(
        factory,
        "admin-1",
        created["id"],
        clear_end_time=True,
        clear_registrations_open_from=True,
    )
    assert updated["end_time"] is None
    assert updated["registrations_open_from"] is None
    assert updated["title"] == "Friday Tasting"  # untouched fields survive a partial update


async def test_create_event_stores_translations_and_rejects_a_missing_original(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)

    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title_language="fr",
        title_fr="Dégustation",
        title_en="Tasting",
        description_language="fr",
        description_fr="Une soirée",
        date=date(2099, 3, 21),
        start_time="18:00",
        category="tasting",
    )
    assert created["title"] == "Dégustation"
    assert created["title_en"] == "Tasting"
    assert created["description"] == "Une soirée"

    with pytest.raises(ValueError, match="original language"):
        await mcp_events.create_event(
            factory,
            "admin-1",
            edition_id=edition_id,
            title_language="fr",
            title_en="Tasting",
            date=date(2099, 3, 21),
            start_time="18:00",
            category="tasting",
        )


async def test_create_event_rejects_an_unknown_category(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)

    with pytest.raises(ValueError, match="category"):
        await mcp_events.create_event(
            factory,
            "admin-1",
            edition_id=edition_id,
            title_en="Gala",
            date=date(2099, 3, 21),
            start_time="18:00",
            category="gala",
        )


async def test_update_event_edits_one_translation_and_clears_it_with_an_empty_string(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    created = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id=edition_id,
        title_language="nl",
        title_nl="Proeverij",
        description_language="nl",
        description_nl="Een avond",
        date=date(2099, 3, 21),
        start_time="18:00",
        category="tasting",
    )

    updated = await mcp_events.update_event(
        factory, "admin-1", created["id"], title_en="Tasting", description_en="An evening"
    )
    assert (updated["title"], updated["title_en"]) == ("Proeverij", "Tasting")
    assert updated["description_en"] == "An evening"

    cleared = await mcp_events.update_event(factory, "admin-1", created["id"], title_en="")
    assert cleared["title_en"] is None

    with pytest.raises(ValueError, match="original language"):
        await mcp_events.update_event(factory, "admin-1", created["id"], title_nl="")

    # Clearing every description text also drops the description language.
    no_description = await mcp_events.update_event(
        factory, "admin-1", created["id"], description_nl="", description_en=""
    )
    assert no_description["description"] == ""
    assert no_description["description_language"] is None

    # Switching the original language needs text in the new original language.
    with pytest.raises(ValueError, match="original language"):
        await mcp_events.update_event(factory, "admin-1", created["id"], title_language="fr")
    switched = await mcp_events.update_event(
        factory, "admin-1", created["id"], title_language="fr", title_fr="Dégustation"
    )
    assert (switched["title_language"], switched["title"]) == ("fr", "Dégustation")
