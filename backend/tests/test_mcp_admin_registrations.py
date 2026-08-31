"""Tests for the admin (write) registration MCP tools."""

from __future__ import annotations

from datetime import date

import pytest

from app.mcp.admin import audit as mcp_audit
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


async def test_list_registrations_empty(db_session):
    factory = mcp_session_factory(db_session)
    result = await mcp_registrations.list_registrations(factory, "admin")
    assert result == {"registrations": [], "count": 0, "next_offset": None}


async def test_list_registrations_returns_compact_projection(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    created = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=2, notes="secret note"
    )

    result = await mcp_registrations.list_registrations(factory, "admin")
    assert result["count"] == 1
    assert result["next_offset"] is None
    item = result["registrations"][0]
    assert item["id"] == created["id"]
    assert item["event_id"] == event.id
    assert item["edition_id"] == "edition-1"
    assert item["guest_count"] == 2
    assert item["person"]["id"] == person.id
    assert item["person"]["email"] == person.email  # admin role sees contact info
    assert "notes" not in item  # compact projection — use get_guest_registration for full detail


async def test_list_registrations_redacts_pii_for_public_role(db_session):
    """``list_registrations`` reuses ``registration_base_dict``'s role-based redaction,
    even though only admins can reach it through the MCP server today."""
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1
    )

    result = await mcp_registrations.list_registrations(factory, "public")
    item = result["registrations"][0]
    assert "email" not in item["person"]
    assert "phone" not in item["person"]


async def test_list_registrations_filters_by_status_and_checked_in(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    confirmed = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1, status="confirmed"
    )
    await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1, status="pending"
    )
    await mcp_registrations.update_registration(factory, "admin-1", confirmed["id"], checked_in=True)

    result = await mcp_registrations.list_registrations(factory, "admin", status="confirmed")
    assert [r["id"] for r in result["registrations"]] == [confirmed["id"]]

    result = await mcp_registrations.list_registrations(factory, "admin", checked_in=True)
    assert [r["id"] for r in result["registrations"]] == [confirmed["id"]]

    result = await mcp_registrations.list_registrations(factory, "admin", checked_in=False)
    assert confirmed["id"] not in [r["id"] for r in result["registrations"]]


async def test_list_registrations_filters_by_edition_and_event(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    other_event = Event(
        id="evt-2",
        edition_id="edition-1",
        title="Zaterdagmiddag",
        date=date(2099, 3, 22),
        start_time="14:00",
        category="festival",
        registration_required=True,
    )
    db_session.add(other_event)
    await db_session.commit()

    reg1 = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1
    )
    reg2 = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=other_event.id, guest_count=1
    )

    result = await mcp_registrations.list_registrations(factory, "admin", event_id=event.id)
    assert [r["id"] for r in result["registrations"]] == [reg1["id"]]

    result = await mcp_registrations.list_registrations(factory, "admin", edition_id="edition-1")
    assert {r["id"] for r in result["registrations"]} == {reg1["id"], reg2["id"]}

    result = await mcp_registrations.list_registrations(factory, "admin", edition_id="nonexistent")
    assert result["registrations"] == []


async def test_list_registrations_search_by_name(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    created = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1
    )

    result = await mcp_registrations.list_registrations(factory, "admin", q="Jean Dupont")
    assert [r["id"] for r in result["registrations"]] == [created["id"]]

    result = await mcp_registrations.list_registrations(factory, "admin", q="Nobody Here")
    assert result["registrations"] == []


async def test_list_registrations_pagination(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    created = [
        await mcp_registrations.create_registration(
            factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1
        )
        for _ in range(3)
    ]
    # Newest first: reverse creation order.
    expected_ids = [r["id"] for r in reversed(created)]

    page1 = await mcp_registrations.list_registrations(factory, "admin", limit=2)
    assert [r["id"] for r in page1["registrations"]] == expected_ids[:2]
    assert page1["next_offset"] == 2

    page2 = await mcp_registrations.list_registrations(factory, "admin", limit=2, offset=page1["next_offset"])
    assert [r["id"] for r in page2["registrations"]] == expected_ids[2:]
    assert page2["next_offset"] is None


async def test_list_registrations_next_offset_null_when_page_exactly_fills_limit(db_session):
    """A result set whose size is an exact multiple of `limit` must not advertise
    a `next_offset` pointing at an empty page (regression: previously any full
    page — len(rows) == effective_limit — got a next_offset regardless of
    whether another matching row actually existed)."""
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    for _ in range(2):
        await mcp_registrations.create_registration(
            factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1
        )

    result = await mcp_registrations.list_registrations(factory, "admin", limit=2)
    assert len(result["registrations"]) == 2
    assert result["next_offset"] is None


async def test_list_registrations_rejects_negative_offset(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="offset"):
        await mcp_registrations.list_registrations(factory, "admin", offset=-1)


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
    ttype = TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6)
    db_session.add_all([room, ttype])
    await db_session.flush()
    layout = Layout(id="lay-1", edition_id="edition-1", room_id="room-1", day_id=1)
    db_session.add(layout)
    await db_session.flush()
    table = Table(id="tbl-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1")
    db_session.add(table)
    await db_session.commit()

    updated = await mcp_registrations.update_registration(factory, "admin-1", created["id"], table_id="tbl-1")
    assert updated["table_id"] == "tbl-1"

    updated = await mcp_registrations.update_registration(factory, "admin-1", created["id"], clear_table=True)
    assert updated["table_id"] is None


async def test_table_assignment_enforces_capacity_and_allows_audited_override(db_session):
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    second_person = Person(id="per-2", name="Marie Dupont", email="marie@example.com", phone="")
    db_session.add(second_person)
    await db_session.commit()
    first = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=2
    )
    second = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=second_person.id, event_id=event.id, guest_count=1
    )

    room = Room(id="room-1", venue_id="venue-1", name="Main Hall")
    ttype = TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=2)
    db_session.add_all([room, ttype])
    await db_session.flush()
    db_session.add(Layout(id="lay-1", edition_id="edition-1", room_id="room-1", day_id=1))
    await db_session.flush()
    db_session.add(Table(id="tbl-1", name="Table 1", table_type_id="ttype-1", layout_id="lay-1"))
    await db_session.commit()

    await mcp_registrations.update_registration(factory, "admin-1", first["id"], table_id="tbl-1")
    with pytest.raises(ValueError, match="seat.*remaining"):
        await mcp_registrations.update_registration(factory, "admin-1", second["id"], table_id="tbl-1")

    updated = await mcp_registrations.update_registration(
        factory, "admin-1", second["id"], table_id="tbl-1", confirm_over_capacity=True
    )
    assert updated["table_id"] == "tbl-1"
    audit = await mcp_audit.list_audit_entries(factory, action="table_capacity_exceeded_confirmed")
    assert len(audit["entries"]) == 1


async def test_update_registration_rejects_table_from_another_edition(db_session):
    """Layouts (and their tables) are per-edition; seating a registration at a
    table drawn for a different edition's floor plan must be rejected."""
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=False)
    created = await mcp_registrations.create_registration(
        factory, "admin-1", person_id=person.id, event_id=event.id, guest_count=1
    )

    room = Room(id="room-1", venue_id="venue-1", name="Main Hall")
    ttype = TableType(id="ttype-1", name="Standard", venue_id="venue-1", capacity=6)
    db_session.add_all([room, ttype])
    await db_session.flush()
    # Inactive: `edition-1` from `_seed_event` is already the active festival edition,
    # and only one may be active per type (#832) — irrelevant here since this test is
    # about table/edition mismatch, not edition activation.
    other_edition = Edition(id="edition-2", year=2099, month="april", venue_id="venue-1", active=False)
    db_session.add(other_edition)
    await db_session.flush()
    layout = Layout(id="lay-other", edition_id="edition-2", room_id="room-1", day_id=1)
    db_session.add(layout)
    await db_session.flush()
    table = Table(id="tbl-other", name="Table 1", table_type_id="ttype-1", layout_id="lay-other")
    db_session.add(table)
    await db_session.commit()

    with pytest.raises(ValueError, match="edition"):
        await mcp_registrations.update_registration(factory, "admin-1", created["id"], table_id="tbl-other")


async def test_update_registration_order_items_audit_action(db_session):
    """Admin order changes are explicitly audited as order updates."""
    factory = mcp_session_factory(db_session)
    person, event = await _seed_event(db_session, with_product=True)
    created = await mcp_registrations.create_registration(
        factory,
        "admin-1",
        person_id=person.id,
        event_id=event.id,
        guest_count=2,
        order_items=[{"product_id": "prod-1", "quantity": 2}],
    )
    await mcp_registrations.update_registration(
        factory,
        "admin-1",
        created["id"],
        order_items=[{"product_id": "prod-1", "quantity": 3}],
    )
    entries = (await mcp_audit.list_audit_entries(factory, resource_type="registration", resource_id=created["id"]))[
        "entries"
    ]
    actions = [e["action"] for e in entries]
    assert "order_updated" in actions


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
