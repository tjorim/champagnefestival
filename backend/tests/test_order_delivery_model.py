from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import OrderItemBase


def test_order_item_defaults_delivered_quantity_from_legacy_delivered_flag():
    item = OrderItemBase(
        product_id="champ-std",
        name="Standard",
        quantity=6,
        price=65.0,
        category="champagne",
        delivered=True,
    )
    assert item.delivered_quantity == 6
    assert item.delivered is True


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
