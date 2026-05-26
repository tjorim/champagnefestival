"""Normalize registration pre_orders with delivered_quantity.

Revision ID: 003
Revises: 002
Create Date: 2026-05-26
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _to_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_order_item(item: dict[str, Any]) -> dict[str, Any]:
    quantity = max(_to_int(item.get("quantity", 0), 0), 0)
    delivered_flag = bool(item.get("delivered", False))
    delivered_quantity = _to_int(item.get("delivered_quantity"), quantity if delivered_flag else 0)
    delivered_quantity = max(0, min(delivered_quantity, quantity))

    normalized = dict(item)
    normalized["quantity"] = quantity
    normalized["delivered_quantity"] = delivered_quantity
    normalized["delivered"] = delivered_quantity == quantity
    return normalized


def _normalize_pre_orders(pre_orders: Any) -> list[dict[str, Any]]:
    if isinstance(pre_orders, str):
        try:
            pre_orders = json.loads(pre_orders)
        except json.JSONDecodeError:
            return []
    if not isinstance(pre_orders, list):
        return []
    return [_normalize_order_item(item) for item in pre_orders if isinstance(item, dict)]


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, pre_orders FROM registrations")).mappings().all()
    for row in rows:
        normalized_pre_orders = _normalize_pre_orders(row["pre_orders"])
        conn.execute(
            sa.text("UPDATE registrations SET pre_orders = CAST(:pre_orders AS jsonb) WHERE id = :id"),
            {"id": row["id"], "pre_orders": json.dumps(normalized_pre_orders)},
        )


def downgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, pre_orders FROM registrations")).mappings().all()
    for row in rows:
        raw_pre_orders = row["pre_orders"]
        if isinstance(raw_pre_orders, str):
            try:
                pre_orders = json.loads(raw_pre_orders)
            except json.JSONDecodeError:
                pre_orders = []
        else:
            pre_orders = raw_pre_orders if isinstance(raw_pre_orders, list) else []
        downgraded_pre_orders: list[dict[str, Any]] = []
        for item in pre_orders:
            if not isinstance(item, dict):
                continue
            downgraded_item = dict(item)
            quantity = max(_to_int(downgraded_item.get("quantity", 0), 0), 0)
            delivered_quantity = _to_int(downgraded_item.get("delivered_quantity"), 0)
            downgraded_item.pop("delivered_quantity", None)
            downgraded_item["delivered"] = max(0, min(delivered_quantity, quantity)) == quantity
            downgraded_pre_orders.append(downgraded_item)

        conn.execute(
            sa.text("UPDATE registrations SET pre_orders = CAST(:pre_orders AS jsonb) WHERE id = :id"),
            {"id": row["id"], "pre_orders": json.dumps(downgraded_pre_orders)},
        )
