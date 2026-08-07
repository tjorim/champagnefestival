"""Tests for the admin (write) registration MCP tools."""

from __future__ import annotations

from datetime import date

import pytest

from app.mcp.admin import registrations as mcp_registrations
from app.models import Edition, Event, Layout, Person, Product, Room, Table, TableType, Venue
from tests.helpers import mcp_session_factory


async def _seed_event(db_session, *, with_product: bool = True) -> tuple[Person, Event]:
    person = Person(id="per-1", name="Jean Dupont", email="jean@example.com", phone="+32499000000")
    venue = Venue(id="venue-1", name="Test Venue")
    db_session.add_all([person, venue])
    await db_session.flush()
    edition = Edition(id="edition-1", year=2099, month="march", venue_id="venue-1")
    db_session.add(edition)
    await db_session.flush()
    event = Event(
        id="evt-1",
        edition_id="edition-1",
        title="Vrijdagavond",
        date=date(2099, 3, 21),
        start_time="18:00",
        category="festival",
        registration_required=True,
    )
    db_session.add(event)
    await db_session.flush()
    if with_product:
        product = Product(id="prod-1", event_id="evt-1", name="Champagne", price=15.0, category="champagne")
        db_session.add(product)
    await db_session.commit()
    return person, event


async def test_create_registration_resolves_order_items(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session)

    created = await mcp_registrations.create_registration(
        factory,
        "admin-1",
        person_id=person.id,
        event_id=event.id,
        guest_count=2,
        order_items=[{"product_id": "prod-1", "quantity": 2}],
    )
    assert created["person_id"] == person.id
    assert created["event_id"] == event.id
    assert created["order_items"][0]["product_id"] == "prod-1"
    assert created["order_items"][0]["name"] == "Champagne"  # server-resolved, not client-supplied
    assert created["order_items"][0]["price"] == 15.0


async def test_create_registration_rejects_unknown_product(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session)

    with pytest.raises(ValueError):
        await mcp_registrations.create_registration(
            factory,
            "admin-1",
            person_id=person.id,
            event_id=event.id,
            guest_count=1,
            order_items=[{"product_id": "nonexistent", "quantity": 1}],
        )


async def test_create_registration_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_registrations.create_registration(
            factory, "admin-1", person_id="nonexistent", event_id="nonexistent", guest_count=1
        )


async def test_update_registration_status_and_checked_in(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    created = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1
    )

    updated = await mcp_registrations.update_registration(
        factory, "admin-1", created["id"], checked_in=True, strap_issued=True
    )
    assert updated["checked_in"] is True
    assert updated["checked_in_at"] is not None
    assert updated["strap_issued"] is True
    assert updated["status"] == created["status"]  # untouched fields survive a partial update

    updated = await mcp_registrations.update_registration(factory, "admin-1", created["id"], checked_in=False)
    assert updated["checked_in"] is False
    assert updated["checked_in_at"] is None


async def test_update_registration_table_assignment_and_clear(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    created = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1
    )

    room = Room(id="room-1", venue_id="venue-1", name="Main Hall")
    ttype = TableType(id="ttype-1", name="Standard", max_capacity=6)
    db_session.add_all([room, ttype])
    await db_session.flush()
    layout = Layout(id="lay-1", edition_id="edition-1", room_id="room-1", day_id=1)
    db_session.add(layout)
    await db_session.flush()
    table = Table(id="tbl-1", name="Table 1", capacity=6, table_type_id="ttype-1", layout_id="lay-1")
    db_session.add(table)
    await db_session.commit()

    updated = await mcp_registrations.update_registration(factory, "admin-1", created["id"], table_id="tbl-1")
    assert updated["table_id"] == "tbl-1"

    updated = await mcp_registrations.update_registration(factory, "admin-1", created["id"], clear_table=True)
    assert updated["table_id"] is None


async def test_update_registration_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_registrations.update_registration(factory, "admin-1", "nonexistent", notes="x")


async def test_delete_registration(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    created = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1
    )

    result = await mcp_registrations.delete_registration(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_registrations.update_registration(factory, "admin-1", created["id"], notes="x")


async def test_delete_registration_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_registrations.delete_registration(factory, "admin-1", "nonexistent")
