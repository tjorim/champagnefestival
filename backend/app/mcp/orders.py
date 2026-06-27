"""Order domain MCP tool implementations."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.mcp.utils import ROLE_ADMIN, order_item_dict
from app.models import Person, Registration, Table
from app.services.operational_search import DEFAULT_RESULT_LIMIT, rank_table_reference


async def get_table_order_summary(
    session_factory: Any,
    role: str,
    table_id: str | None = None,
    table_reference: str | None = None,
) -> dict:
    if not table_id and not table_reference:
        raise ValueError("Provide 'table_id' or 'table_reference'.")

    async with session_factory() as db:
        if not table_id and table_reference:
            tables_result = await db.execute(select(Table).order_by(Table.name))
            candidates = [
                table
                for table in tables_result.scalars().all()
                if rank_table_reference(table_reference, table_id=table.id, table_name=table.name) is not None
            ]
            if len(candidates) != 1:
                return {
                    "table_reference": table_reference,
                    "registrations": [],
                    "candidates": [
                        {"table_id": table.id, "table_name": table.name} for table in candidates[:DEFAULT_RESULT_LIMIT]
                    ],
                    "message": (
                        "No table matched this reference."
                        if not candidates
                        else "Multiple tables matched this reference; choose a table_id."
                    ),
                }
            table_id = candidates[0].id
        if table_id is None:
            raise ValueError("table_id could not be resolved.")

        table_result = await db.execute(select(Table).where(Table.id == table_id))
        table: Table | None = table_result.scalar_one_or_none()
        if table is None:
            return {"table_id": table_id, "registrations": [], "message": f"Table '{table_id}' not found."}

        regs_result = await db.execute(select(Registration).where(Registration.table_id == table_id))
        regs: list[Registration] = list(regs_result.scalars().all())

        person_ids = list({reg.person_id for reg in regs})
        persons: dict[str, Person] = {}
        if person_ids:
            persons_result = await db.execute(select(Person).where(Person.id.in_(person_ids)))
            persons = {p.id: p for p in persons_result.scalars().all()}

        reg_summaries = []
        for reg in regs:
            person = persons.get(reg.person_id)
            orders = [order_item_dict(item) for item in (reg.pre_orders or [])]
            ordered_quantity_total = sum(o["quantity"] for o in orders)
            delivered_quantity_total = sum(o["delivered_quantity"] for o in orders)
            remaining_quantity_total = sum(o["remaining_quantity"] for o in orders)
            reg_summaries.append(
                {
                    "registration_id": reg.id,
                    "person_name": person.name if person else None,
                    "person_id": reg.person_id if role == ROLE_ADMIN else None,
                    "guest_count": reg.guest_count,
                    "checked_in": reg.checked_in,
                    "orders": orders,
                    "order_count": len(orders),
                    "ordered_quantity_total": ordered_quantity_total,
                    "delivered_quantity_total": delivered_quantity_total,
                    "remaining_quantity_total": remaining_quantity_total,
                    "all_delivered": all(o["remaining_quantity"] == 0 for o in orders) if orders else True,
                }
            )

        return {
            "table_id": table_id,
            "table_name": table.name,
            "registrations": reg_summaries,
            "registration_count": len(reg_summaries),
        }


async def get_guest_order_status(session_factory: Any, registration_id: str) -> dict:
    async with session_factory() as db:
        result = await db.execute(select(Registration).where(Registration.id == registration_id))
        reg: Registration | None = result.scalar_one_or_none()
        if reg is None:
            return {
                "registration_id": registration_id,
                "orders": [],
                "message": f"Registration '{registration_id}' not found.",
            }

        person_result = await db.execute(select(Person).where(Person.id == reg.person_id))
        person: Person | None = person_result.scalar_one_or_none()

        orders = [order_item_dict(item) for item in (reg.pre_orders or [])]
        champagne_orders = [o for o in orders if o["category"] == "champagne"]
        delivered = [o for o in champagne_orders if o["delivered"]]
        pending = [o for o in champagne_orders if not o["delivered"]]

        return {
            "registration_id": reg.id,
            "person_name": person.name if person else None,
            "table_id": reg.table_id,
            "checked_in": reg.checked_in,
            "orders": orders,
            "champagne_lines_total": len(champagne_orders),
            "champagne_lines_delivered": len(delivered),
            "champagne_lines_pending": len(pending),
            "champagne_quantity_ordered": sum(o["quantity"] for o in champagne_orders),
            "champagne_quantity_delivered": sum(o["delivered_quantity"] for o in champagne_orders),
            "champagne_quantity_pending": sum(o["remaining_quantity"] for o in champagne_orders),
        }
