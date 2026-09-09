"""Event-scoped physical allocation, independent of product stock reservations."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Layout, Registration, RegistrationAllocation, Table
from app.schemas import TableAllocation


def allocated_registration_filter(table_ids: list[str]):
    return Registration.allocations.any(RegistrationAllocation.table_id.in_(table_ids))


async def registration_ids_by_table(db: AsyncSession, table_ids: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {key: [] for key in table_ids}
    if not table_ids:
        return result
    rows = (await db.execute(select(Registration).where(allocated_registration_filter(table_ids)))).scalars()
    for registration in rows:
        ids = [a.table_id for a in registration.allocations]
        for key in ids:
            if key in result:
                result[key].append(registration.id)
    return result


def whole_table_quantity(registration: Registration) -> int:
    return sum(
        item["quantity"]
        for item in registration.order_items
        if registration.product_snapshot.get(item["product_id"], {}).get("unit") == "table"
    )


async def validate_allocations(
    db: AsyncSession, registration: Registration, entries: list[TableAllocation], *, confirm_over_capacity: bool = False
) -> None:
    """Caller locks the event and booking first; table locks serialize capacity edits."""
    ids = [entry.table_id for entry in entries]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "Each table can appear only once in a booking's allocations.")
    whole_tables = whole_table_quantity(registration)
    if whole_tables:
        if len(entries) > whole_tables or any(not e.exclusive for e in entries):
            raise HTTPException(409, "Whole-table bookings require exclusive allocations within the booked quantity.")
        # Companion/headcount policy is deliberately not inferred from table quantity.
    else:
        if any(e.exclusive or e.guest_count == 0 for e in entries):
            raise HTTPException(400, "Shared seating needs a positive guest count and cannot claim exclusive tables.")
        if sum(e.guest_count for e in entries) > registration.guest_count:
            raise HTTPException(409, "Allocated guests exceed the booking's guest count. Adjust the allocations first.")
    if not ids:
        return
    tables = (
        await db.execute(
            select(Table, Layout.event_id)
            .join(Layout, Table.layout_id == Layout.id)
            .where(Table.id.in_(ids))
            .order_by(Table.id)
            .with_for_update(of=Table)
        )
    ).all()
    if len(tables) != len(ids):
        raise HTTPException(404, "One or more allocation tables no longer exist.")
    by_id = {table.id: table for table, _ in tables}
    if any(event_id != registration.event_id for _, event_id in tables):
        raise HTTPException(400, "Allocate tables from a plan belonging to this booking's event.")
    others = (
        (
            await db.execute(
                select(Registration).where(
                    allocated_registration_filter(ids),
                    Registration.id != registration.id,
                    Registration.status != "cancelled",
                )
            )
        )
        .scalars()
        .all()
    )
    for entry in entries:
        occupied = 0
        claimed = False
        exclusive = False
        for other in others:
            matching = [a for a in other.allocations if a.table_id == entry.table_id]
            if matching:
                claimed = True
                occupied += sum(a.guest_count for a in matching)
                exclusive |= any(a.exclusive for a in matching)
        if exclusive or (entry.exclusive and claimed):
            raise HTTPException(409, "This table is already allocated; exclusive tables cannot be shared.")
        if not confirm_over_capacity and occupied + entry.guest_count > by_id[entry.table_id].capacity:
            raise HTTPException(409, f"Table '{by_id[entry.table_id].name}' does not have enough remaining seats.")


def replace_allocations(registration: Registration, entries: list[TableAllocation]) -> None:
    existing = {a.table_id: a for a in registration.allocations}
    rows = []
    for entry in entries:
        row = existing.get(entry.table_id) or RegistrationAllocation(
            registration_id=registration.id, table_id=entry.table_id
        )
        row.guest_count = entry.guest_count
        row.exclusive = entry.exclusive
        rows.append(row)
    registration.allocations = rows
