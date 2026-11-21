"""Tests for the admin (write) floor-plan area MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import areas as mcp_areas
from app.models import Layout, Organization, Room, Venue
from tests.helpers import mcp_session_factory, seed_layout_event


async def _seed_layout(db_session, *, layout_id: str = "lay-1") -> None:
    venue = Venue(id="venue-1", name="Test Venue")
    db_session.add(venue)
    await db_session.flush()
    room = Room(id="room-1", venue_id="venue-1", name="Main Hall")
    db_session.add(room)
    await db_session.flush()
    layout = Layout(id=layout_id, room_id="room-1", event_id=await seed_layout_event(db_session, "room-1", 1))
    db_session.add(layout)
    await db_session.commit()


async def test_create_get_list_area(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)

    created = await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="DJ Stage")
    assert created["label"] == "DJ Stage"
    assert created["layout_id"] == "lay-1"
    area_id = created["id"]

    fetched = await mcp_areas.get_area(factory, area_id)
    assert fetched["id"] == area_id

    listed = await mcp_areas.list_areas(factory)
    assert any(a["id"] == area_id for a in listed["areas"])

    listed_filtered = await mcp_areas.list_areas(factory, layout_id="lay-1")
    assert any(a["id"] == area_id for a in listed_filtered["areas"])


async def test_create_area_layout_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_areas.create_area(factory, "admin-1", layout_id="nonexistent", label="Ghost Area")


async def test_create_area_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)

    with pytest.raises(ValueError, match="rotation"):
        await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="DJ Stage", rotation=360)  # le=359


async def test_create_area_with_organization(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    organization = Organization(name="Oyster Bar", type="vendor", active=True)
    db_session.add(organization)
    await db_session.commit()
    await db_session.refresh(organization)
    organization_id = organization.id

    created = await mcp_areas.create_area(
        factory, "admin-1", layout_id="lay-1", label="Oyster Stand", organization_id=organization_id
    )
    assert created["organization_id"] == organization_id


async def test_create_area_organization_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)

    with pytest.raises(ValueError, match="not found"):
        await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="Oyster Stand", organization_id=999)


async def test_create_area_organization_inactive(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    organization = Organization(name="Retired Vendor", type="vendor", active=False)
    db_session.add(organization)
    await db_session.commit()
    await db_session.refresh(organization)

    with pytest.raises(ValueError, match="inactive"):
        await mcp_areas.create_area(
            factory, "admin-1", layout_id="lay-1", label="Oyster Stand", organization_id=organization.id
        )


async def test_get_area_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_areas.get_area(factory, "nonexistent")


async def test_update_area_partial(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    created = await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="DJ Stage")

    updated = await mcp_areas.update_area(factory, "admin-1", created["id"], x=40.0)
    assert updated["x"] == 40.0
    assert updated["label"] == "DJ Stage"  # untouched fields survive a partial update


async def test_update_area_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    created = await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="DJ Stage")

    with pytest.raises(ValueError, match="width_m"):
        await mcp_areas.update_area(factory, "admin-1", created["id"], width_m=100.0)  # le=50.0


async def test_update_area_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_areas.update_area(factory, "admin-1", "nonexistent", x=40.0)


async def test_update_area_organization_assign_and_clear(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    organization = Organization(name="Oyster Bar", type="vendor", active=True)
    db_session.add(organization)
    await db_session.commit()
    await db_session.refresh(organization)

    created = await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="Oyster Stand")
    assert created["organization_id"] is None

    updated = await mcp_areas.update_area(factory, "admin-1", created["id"], organization_id=organization.id)
    assert updated["organization_id"] == organization.id

    cleared = await mcp_areas.update_area(factory, "admin-1", created["id"], clear_organization_id=True)
    assert cleared["organization_id"] is None


async def test_update_area_organization_not_found(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    created = await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="DJ Stage")

    with pytest.raises(ValueError, match="not found"):
        await mcp_areas.update_area(factory, "admin-1", created["id"], organization_id=999)


async def test_update_area_organization_inactive(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    organization = Organization(name="Retired Vendor", type="vendor", active=False)
    db_session.add(organization)
    await db_session.commit()
    await db_session.refresh(organization)
    created = await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="DJ Stage")

    with pytest.raises(ValueError, match="inactive"):
        await mcp_areas.update_area(factory, "admin-1", created["id"], organization_id=organization.id)


async def test_update_area_rejects_both_organization_id_and_clear(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    organization = Organization(name="Oyster Bar", type="vendor", active=True)
    db_session.add(organization)
    await db_session.commit()
    await db_session.refresh(organization)
    created = await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="DJ Stage")

    with pytest.raises(ValueError, match="not both"):
        await mcp_areas.update_area(
            factory, "admin-1", created["id"], organization_id=organization.id, clear_organization_id=True
        )


async def test_delete_area(db_session):
    factory = mcp_session_factory(db_session)
    await _seed_layout(db_session)
    created = await mcp_areas.create_area(factory, "admin-1", layout_id="lay-1", label="DJ Stage")

    result = await mcp_areas.delete_area(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_areas.get_area(factory, created["id"])


async def test_delete_area_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_areas.delete_area(factory, "admin-1", "nonexistent")
