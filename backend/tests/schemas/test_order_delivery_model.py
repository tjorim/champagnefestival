from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import OrderItemBase


def test_order_item_defaults_to_no_delivery():
    item = OrderItemBase(
        product_id="champ-std",
        name="Standard",
        quantity=6,
        price=65.0,
        category="champagne",
        delivered=True,
    )
    assert item.delivered_quantity == 0
    assert item.delivered is False


def test_order_item_partial_delivery_is_supported_and_derived_delivered_is_false():
    item = OrderItemBase(
        product_id="champ-std",
        name="Standard",
        quantity=6,
        delivered_quantity=4,
        price=65.0,
        category="champagne",
        delivered=True,
    )
    assert item.delivered_quantity == 4
    assert item.delivered is False


def test_order_item_rejects_delivered_quantity_above_ordered_quantity():
    with pytest.raises(ValidationError):
        OrderItemBase(
            product_id="champ-std",
            name="Standard",
            quantity=2,
            delivered_quantity=3,
            price=65.0,
            category="champagne",
        )


def test_order_item_rejects_included_quantity_above_ordered_quantity():
    with pytest.raises(ValidationError):
        OrderItemBase(
            product_id="champ-std",
            name="Standard",
            quantity=2,
            included_quantity=3,
            price=65.0,
            category="champagne",
        )


def test_order_item_rejects_a_zero_quantity():
    # The API never sends a line with nothing ordered, so clients need not clamp it.
    with pytest.raises(ValidationError):
        OrderItemBase(product_id="champ-std", name="Standard", quantity=0, price=65.0, category="champagne")
