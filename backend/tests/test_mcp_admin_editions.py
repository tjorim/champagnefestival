"""Tests for the admin (write) edition MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import audit as mcp_audit
from app.mcp.admin import editions as mcp_editions
from app.models import Exhibitor, Venue
from tests.helpers import mcp_session_factory


async def _create_venue(db_session, venue_id: str = "venue-1") -> str:
    venue = Venue(id=venue_id, name="Test Venue")
    db_session.add(venue)
    await db_session.flush()
    return venue.id


async def test_create_get_edition(db_session):
    factory = mcp_session_factory(db_session)
    venue_id = await _create_venue(db_session)

    created = await mcp_editions.create_edition(
        factory, "admin-1", id="edition-1", year=2099, month="march", venue_id=venue_id
    )
    assert created["id"] == "edition-1"
    assert created["year"] == 2099
    assert created["month"] == "march"

    fetched = await mcp_editions.get_edition(factory, "edition-1")
    assert fetched["id"] == "edition-1"
    assert fetched["venue"]["id"] == venue_id


async def test_create_edition_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    venue_id = await _create_venue(db_session)
    with pytest.raises(ValueError, match="year"):
        await mcp_editions.create_edition(
            factory, "admin-1", id="edition-bad", year=1900, month="march", venue_id=venue_id
        )  # year ge=2020


async def test_get_edition_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_editions.get_edition(factory, "nonexistent")


async def test_update_edition_partial(db_session):
    factory = mcp_session_factory(db_session)
    venue_id = await _create_venue(db_session)
    created = await mcp_editions.create_edition(
        factory, "admin-1", id="edition-1", year=2099, month="march", venue_id=venue_id
    )

    updated = await mcp_editions.update_edition(factory, "admin-1", created["id"], month="april")
    assert updated["month"] == "april"
    assert updated["year"] == 2099  # untouched fields survive a partial update


async def test_update_edition_clear_co_organizer(db_session):
    factory = mcp_session_factory(db_session)
    venue_id = await _create_venue(db_session)
    co_organizer = Exhibitor(name="Co-op", type="sponsor")
    db_session.add(co_organizer)
    await db_session.flush()

    created = await mcp_editions.create_edition(
        factory,
        "admin-1",
        id="edition-co-organizer",
        year=2099,
        month="march",
        venue_id=venue_id,
        co_organizer_exhibitor_id=co_organizer.id,
    )
    assert created["co_organizer"]["id"] == co_organizer.id

    updated = await mcp_editions.update_edition(factory, "admin-1", created["id"], clear_co_organizer=True)
    assert updated["co_organizer"] is None


async def test_update_edition_rejects_both_co_organizer_id_and_clear(db_session):
    factory = mcp_session_factory(db_session)
    venue_id = await _create_venue(db_session)
    co_organizer = Exhibitor(name="Co-op", type="sponsor")
    db_session.add(co_organizer)
    await db_session.flush()
    created = await mcp_editions.create_edition(
        factory, "admin-1", id="edition-1", year=2099, month="march", venue_id=venue_id
    )

    with pytest.raises(ValueError, match="not both"):
        await mcp_editions.update_edition(
            factory,
            "admin-1",
            created["id"],
            co_organizer_exhibitor_id=co_organizer.id,
            clear_co_organizer=True,
        )


async def test_update_edition_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_editions.update_edition(factory, "admin-1", "nonexistent", month="april")


async def test_delete_edition(db_session):
    factory = mcp_session_factory(db_session)
    venue_id = await _create_venue(db_session)
    created = await mcp_editions.create_edition(
        factory, "admin-1", id="edition-1", year=2099, month="march", venue_id=venue_id
    )

    result = await mcp_editions.delete_edition(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_editions.get_edition(factory, created["id"])


async def test_create_edition_rejects_vendor_exhibitors(db_session):
    """Vendor-type exhibitors must not be linked to editions."""
    factory = mcp_session_factory(db_session)
    venue_id = await _create_venue(db_session)
    vendor = Exhibitor(name="Food Vendor", type="vendor")
    db_session.add(vendor)
    await db_session.flush()

    with pytest.raises(ValueError, match="[Vv]endor"):
        await mcp_editions.create_edition(
            factory,
            "admin-1",
            id="edition-vendor",
            year=2099,
            month="march",
            venue_id=venue_id,
            exhibitors=[vendor.id],
        )


async def test_update_edition_rejects_exhibitors_on_non_festival_edition(db_session):
    """Backend validation must reject an explicit attempt to assign exhibitors to an
    off-festival edition."""
    factory = mcp_session_factory(db_session)
    venue_id = await _create_venue(db_session)
    producer = Exhibitor(name="Bollinger", type="producer")
    db_session.add(producer)
    await db_session.flush()

    created = await mcp_editions.create_edition(
        factory,
        "admin-1",
        id="edition-bourse",
        year=2099,
        month="march",
        venue_id=venue_id,
        edition_type="bourse",
    )

    with pytest.raises(ValueError, match="festival"):
        await mcp_editions.update_edition(factory, "admin-1", created["id"], exhibitors=[producer.id])


async def test_update_edition_records_implicit_exhibitor_clearing_in_audit(db_session):
    """Dropping the exhibitor lineup because the edition type moved off festival is
    an implicit, destructive change — it must be visible in the audit trail, not
    just folded silently into fields_changed."""
    factory = mcp_session_factory(db_session)
    venue_id = await _create_venue(db_session)
    producer = Exhibitor(name="Bollinger", type="producer")
    db_session.add(producer)
    await db_session.flush()

    created = await mcp_editions.create_edition(
        factory,
        "admin-1",
        id="edition-audit-implicit-clear",
        year=2099,
        month="march",
        venue_id=venue_id,
        edition_type="festival",
        exhibitors=[producer.id],
    )
    assert created["producers"]

    await mcp_editions.update_edition(factory, "admin-1", created["id"], edition_type="bourse")

    entries = (await mcp_audit.list_audit_entries(factory, resource_type="edition", resource_id=created["id"]))[
        "entries"
    ]
    updated_entries = [e for e in entries if e["action"] == "edition_updated"]
    assert len(updated_entries) == 1
    assert updated_entries[0]["details"].get("exhibitors_cleared") is True

    # A second update to an already-non-festival edition, changing an unrelated
    # field, must NOT claim exhibitors were cleared again (there's nothing left).
    await mcp_editions.update_edition(factory, "admin-1", created["id"], active=False)
    entries = (await mcp_audit.list_audit_entries(factory, resource_type="edition", resource_id=created["id"]))[
        "entries"
    ]
    updated_entries = [e for e in entries if e["action"] == "edition_updated"]
    assert len(updated_entries) == 2
    assert "exhibitors_cleared" not in updated_entries[0]["details"]  # newest first
