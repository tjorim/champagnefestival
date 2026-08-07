"""Tests for the admin (write) edition MCP tools."""

from __future__ import annotations

import pytest

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
