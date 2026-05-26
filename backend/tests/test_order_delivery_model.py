from __future__ import annotations

import importlib.util
from pathlib import Path

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


def test_migration_normalizes_legacy_and_partial_delivery_data():
    migration_path = (
        Path(__file__).resolve().parents[1] / "alembic" / "versions" / "003_partial_delivery_quantity.py"
    )
    spec = importlib.util.spec_from_file_location("alembic_003_partial_delivery_quantity", migration_path)
    assert spec is not None
    assert spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    normalized_legacy = migration._normalize_order_item(
        {
            "product_id": "champ-std",
            "name": "Standard",
            "quantity": 6,
            "price": 65.0,
            "category": "champagne",
            "delivered": True,
        }
    )
    assert normalized_legacy["delivered_quantity"] == 6
    assert normalized_legacy["delivered"] is True

    normalized_partial = migration._normalize_order_item(
        {
            "product_id": "champ-std",
            "name": "Standard",
            "quantity": 6,
            "delivered_quantity": 4,
            "price": 65.0,
            "category": "champagne",
            "delivered": False,
        }
    )
    assert normalized_partial["delivered_quantity"] == 4
    assert normalized_partial["delivered"] is False
