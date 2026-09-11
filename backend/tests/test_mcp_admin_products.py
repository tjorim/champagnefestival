"""Tests for the admin (write) product MCP tools."""

from __future__ import annotations

from datetime import date

import pytest

from app.mcp.admin import products as mcp_products
from app.models import Edition, Event, Venue
from tests.helpers import mcp_session_factory


async def _create_event(db_session, *, event_id: str = "evt-1") -> str:
    venue = Venue(id=f"venue-{event_id}", name="Test Venue")
    db_session.add(venue)
    await db_session.flush()
    edition = Edition(id=f"edition-{event_id}", year=2099, month="march", venue_id=venue.id, active=False)
    db_session.add(edition)
    await db_session.flush()
    event = Event(
        id=event_id,
        edition_id=edition.id,
        title="Vrijdagavond",
        date=date(2099, 3, 21),
        start_time="18:00",
        category="festival",
        registration_required=True,
    )
    db_session.add(event)
    await db_session.commit()
    return event.id


async def test_create_get_product(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)

    created = await mcp_products.create_product(
        factory,
        "admin-1",
        event_id=event_id,
        name="Champagne Bottle",
        price=25.0,
        category="champagne",
    )
    assert created["name"] == "Champagne Bottle"
    assert created["event_id"] == event_id
    assert created["purchasable"] is True
    assert created["sold_out"] is False

    fetched = await mcp_products.get_product(factory, created["id"])
    assert fetched["id"] == created["id"]
    assert fetched["name"] == "Champagne Bottle"


async def test_create_product_with_explicit_purchasable_false(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)

    created = await mcp_products.create_product(
        factory,
        "admin-1",
        event_id=event_id,
        name="Kitchen Supply",
        price=1.0,
        category="other",
        purchasable=False,
    )
    assert created["purchasable"] is False


async def test_create_product_rejects_malformed_inclusion_with_a_translated_error(db_session):
    """A malformed inclusion dict must fail through `validate_with_schema`'s
    translated-error path, not escape as a raw Pydantic `ValidationError` —
    it has to reach the outer `ProductCreate` schema unconstructed so nested
    validation runs inside the same try/except."""
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)

    with pytest.raises(ValueError, match="inclusions"):
        await mcp_products.create_product(
            factory,
            "admin-1",
            event_id=event_id,
            name="Bad Bundle",
            price=1.0,
            category="other",
            inclusions=[{"product_id": "target", "rounding": "sideways"}],
        )


async def test_update_product_rejects_malformed_inclusion_with_a_translated_error(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)
    created = await mcp_products.create_product(
        factory, "admin-1", event_id=event_id, name="Champagne Bottle", price=25.0, category="champagne"
    )

    with pytest.raises(ValueError, match="inclusions"):
        await mcp_products.update_product(
            factory,
            "admin-1",
            created["id"],
            inclusions=[{"product_id": "target", "rounding": "sideways"}],
        )


async def test_create_product_rejects_required_product_that_is_not_purchasable(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)

    with pytest.raises(ValueError, match="purchasable"):
        await mcp_products.create_product(
            factory,
            "admin-1",
            event_id=event_id,
            name="Bad Product",
            price=1.0,
            category="other",
            purchasable=False,
            required=True,
        )


async def test_create_product_rejects_missing_event(db_session):
    factory = mcp_session_factory(db_session)

    with pytest.raises(ValueError, match="not found"):
        await mcp_products.create_product(
            factory,
            "admin-1",
            event_id="nonexistent",
            name="Champagne Bottle",
            price=25.0,
            category="champagne",
        )


async def test_get_product_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_products.get_product(factory, "nonexistent")


async def test_list_products_filters_by_event(db_session):
    factory = mcp_session_factory(db_session)
    event_a = await _create_event(db_session, event_id="evt-a")
    event_b = await _create_event(db_session, event_id="evt-b")

    await mcp_products.create_product(
        factory, "admin-1", event_id=event_a, name="A Product", price=1.0, category="other"
    )
    await mcp_products.create_product(
        factory, "admin-1", event_id=event_b, name="B Product", price=1.0, category="other"
    )

    all_products = await mcp_products.list_products(factory)
    assert len(all_products) == 2

    a_products = await mcp_products.list_products(factory, event_id=event_a)
    assert [p["name"] for p in a_products] == ["A Product"]


async def test_update_product_partial(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)
    created = await mcp_products.create_product(
        factory, "admin-1", event_id=event_id, name="Champagne Bottle", price=25.0, category="champagne"
    )

    updated = await mcp_products.update_product(factory, "admin-1", created["id"], purchasable=False)
    assert updated["purchasable"] is False
    assert updated["name"] == "Champagne Bottle"  # untouched fields survive a partial update


async def test_update_product_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_products.update_product(factory, "admin-1", "nonexistent", purchasable=False)


async def test_update_product_stock_and_clear_stock(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)
    created = await mcp_products.create_product(
        factory, "admin-1", event_id=event_id, name="Champagne Bottle", price=25.0, category="champagne"
    )

    limited = await mcp_products.update_product(factory, "admin-1", created["id"], stock=0)
    assert limited["stock"] == 0
    assert limited["sold_out"] is True

    unlimited = await mcp_products.update_product(factory, "admin-1", created["id"], clear_stock=True)
    assert unlimited["stock"] is None
    assert unlimited["sold_out"] is False


async def test_update_product_allows_bundling_a_hidden_target(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)
    hidden = await mcp_products.create_product(
        factory, "admin-1", event_id=event_id, name="Hidden Bottle", price=25.0, category="champagne", purchasable=False
    )
    table = await mcp_products.create_product(
        factory, "admin-1", event_id=event_id, name="VIP Table", price=200.0, category="other"
    )

    updated = await mcp_products.update_product(
        factory,
        "admin-1",
        table["id"],
        inclusions=[{"product_id": hidden["id"], "quantity": 1, "per_quantity": 1, "rounding": "down"}],
    )
    assert updated["inclusions"][0]["product_id"] == hidden["id"]


async def test_update_product_rejects_making_a_required_product_hidden(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)
    created = await mcp_products.create_product(
        factory, "admin-1", event_id=event_id, name="Champagne Bottle", price=25.0, category="champagne", required=True
    )

    with pytest.raises(ValueError, match="purchasable"):
        await mcp_products.update_product(factory, "admin-1", created["id"], purchasable=False)


async def test_update_product_clears_inclusions(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)
    bottle = await mcp_products.create_product(
        factory, "admin-1", event_id=event_id, name="Bottle", price=25.0, category="champagne"
    )
    table = await mcp_products.create_product(
        factory,
        "admin-1",
        event_id=event_id,
        name="VIP Table",
        price=200.0,
        category="other",
        inclusions=[{"product_id": bottle["id"], "quantity": 1, "per_quantity": 1, "rounding": "down"}],
    )
    assert table["inclusions"][0]["product_id"] == bottle["id"]

    cleared = await mcp_products.update_product(factory, "admin-1", table["id"], clear_inclusions=True)
    assert cleared["inclusions"] == []


async def test_delete_product(db_session):
    factory = mcp_session_factory(db_session)
    event_id = await _create_event(db_session)
    created = await mcp_products.create_product(
        factory, "admin-1", event_id=event_id, name="Champagne Bottle", price=25.0, category="champagne"
    )

    result = await mcp_products.delete_product(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_products.get_product(factory, created["id"])
