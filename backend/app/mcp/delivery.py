"""Champagne delivery domain MCP tool implementations."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.mcp.utils import get_active_edition_obj, order_item_dict
from app.models import Edition, Registration, Table


async def get_champagne_delivery_summary(session_factory: Any, edition_id: str | None = None) -> dict:
    from sqlalchemy.orm import selectinload

    async with session_factory() as db:
        if edition_id:
            edition_result = await db.execute(
                select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
            )
            edition: Edition | None = edition_result.scalar_one_or_none()
            if edition is None:
                return {"edition_id": edition_id, "products": [], "message": f"Edition '{edition_id}' not found."}
        else:
            edition = await get_active_edition_obj(db)
            if edition is None:
                return {"edition_id": None, "products": [], "message": "No active edition found."}

        event_ids = [ev.id for ev in edition.events]
        if not event_ids:
            return {"edition_id": edition.id, "products": [], "message": "No events found in this edition."}

        regs_result = await db.execute(select(Registration).where(Registration.event_id.in_(event_ids)))
        regs: list[Registration] = list(regs_result.scalars().all())

        product_stats: dict[str, dict] = {}
        for reg in regs:
            for item in reg.pre_orders or []:
                normalized_item = order_item_dict(item)
                if normalized_item["category"] != "champagne":
                    continue
                pid = normalized_item["product_id"]
                name = normalized_item["name"]
                qty = normalized_item["quantity"]
                delivered_qty = normalized_item["delivered_quantity"]
                remaining_qty = normalized_item["remaining_quantity"]
                delivered = remaining_qty == 0

                if pid not in product_stats:
                    product_stats[pid] = {
                        "product_id": pid,
                        "product_name": name,
                        "ordered_lines": 0,
                        "delivered_lines": 0,
                        "pending_lines": 0,
                        "partially_delivered_lines": 0,
                        "ordered_quantity": 0,
                        "delivered_quantity": 0,
                        "pending_quantity": 0,
                    }
                product_stats[pid]["ordered_lines"] += 1
                product_stats[pid]["ordered_quantity"] += qty
                if delivered:
                    product_stats[pid]["delivered_lines"] += 1
                else:
                    product_stats[pid]["pending_lines"] += 1
                    if delivered_qty > 0:
                        product_stats[pid]["partially_delivered_lines"] += 1
                product_stats[pid]["delivered_quantity"] += delivered_qty
                product_stats[pid]["pending_quantity"] += remaining_qty

        products = sorted(product_stats.values(), key=lambda x: x["product_name"])
        return {
            "edition_id": edition.id,
            "products": products,
        }


async def get_undelivered_champagne_by_table(session_factory: Any, edition_id: str | None = None) -> dict:
    from sqlalchemy.orm import selectinload

    async with session_factory() as db:
        if edition_id:
            edition_result = await db.execute(
                select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
            )
            edition: Edition | None = edition_result.scalar_one_or_none()
            if edition is None:
                return {"tables": [], "message": f"Edition '{edition_id}' not found."}
        else:
            edition = await get_active_edition_obj(db)
            if edition is None:
                return {"tables": [], "message": "No active edition found."}

        event_ids = [ev.id for ev in edition.events]
        if not event_ids:
            return {"edition_id": edition.id, "tables": []}

        regs_result = await db.execute(
            select(Registration).where(
                Registration.event_id.in_(event_ids),
                Registration.table_id.isnot(None),
            )
        )
        regs: list[Registration] = list(regs_result.scalars().all())

        pending_table_map: dict[str, dict] = {}
        for reg in regs:
            if not reg.table_id:
                continue
            pending_items = []
            for item in reg.pre_orders or []:
                normalized_item = order_item_dict(item)
                if normalized_item["category"] == "champagne" and normalized_item["remaining_quantity"] > 0:
                    pending_items.append(normalized_item)
            if not pending_items:
                continue
            tbl_id = reg.table_id
            if tbl_id not in pending_table_map:
                pending_table_map[tbl_id] = {
                    "table_id": tbl_id,
                    "pending_lines": 0,
                    "pending_quantity": 0,
                    "pending_registrations": [],
                }
            pending_table_map[tbl_id]["pending_lines"] += len(pending_items)
            pending_table_map[tbl_id]["pending_quantity"] += sum(
                item["remaining_quantity"] for item in pending_items
            )
            pending_table_map[tbl_id]["pending_registrations"].append(reg.id)

        if not pending_table_map:
            return {"edition_id": edition.id, "tables": [], "message": "All champagne orders have been delivered."}

        table_ids = list(pending_table_map.keys())
        tables_result = await db.execute(select(Table).where(Table.id.in_(table_ids)))
        table_name_map = {t.id: t.name for t in tables_result.scalars().all()}

        tables = []
        for tbl_id, data in sorted(pending_table_map.items(), key=lambda x: table_name_map.get(x[0]) or ""):
            tables.append(
                {
                    "table_id": tbl_id,
                    "table_name": table_name_map.get(tbl_id, tbl_id),
                    "pending_lines": data["pending_lines"],
                    "pending_quantity": data["pending_quantity"],
                    "pending_registration_ids": data["pending_registrations"],
                }
            )

        return {"edition_id": edition.id, "tables": tables, "count": len(tables)}
