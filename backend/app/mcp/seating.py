"""Seating domain MCP tool implementations."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.mcp.utils import (
    get_active_edition_obj,
    order_item_dict,
    person_dict,
    registration_base_dict,
)
from app.models import Layout, Person, Registration, Table
from app.services.operational_search import (
    DEFAULT_RESULT_LIMIT,
    best_person_match,
    person_search_order_by,
    person_search_predicate,
    rank_table_reference,
)


async def find_guest(
    session_factory: Any,
    role: str,
    name: str | None,
    email: str | None,
) -> dict:
    name = name.strip() if name else None
    email = email.strip() if email else None
    if not name and not email:
        raise ValueError("Provide at least one of 'name' or 'email' to search.")

    async with session_factory() as db:
        stmt = (
            select(Person)
            .where(person_search_predicate(name=name, email=email))
            .order_by(*person_search_order_by(name=name, email=email))
            .limit(DEFAULT_RESULT_LIMIT + 1)
        )
        result = await db.execute(stmt)
        persons: list[Person] = list(result.scalars().all())
        person_ids = [person.id for person in persons[:DEFAULT_RESULT_LIMIT]]
        registrations_by_person: dict[str, list[Registration]] = {}
        if person_ids:
            registrations_result = await db.execute(
                select(Registration)
                .where(Registration.person_id.in_(person_ids))
                .order_by(Registration.created_at.desc())
            )
            for registration in registrations_result.scalars().all():
                bucket = registrations_by_person.setdefault(registration.person_id, [])
                if len(bucket) < DEFAULT_RESULT_LIMIT:
                    bucket.append(registration)
        ranked = [
            (
                best_person_match(
                    name=name,
                    email=email,
                    candidate_name=person.name,
                    candidate_email=person.email,
                ),
                person,
            )
            for person in persons
        ]

        return {
            "guests": [
                {
                    **person_dict(person, role=role),
                    "match": (
                        {"field": match.field, "kind": match.kind}
                        if match is not None
                        else {"field": "name" if name else "email", "kind": "fuzzy"}
                    ),
                    "registrations": [
                        {
                            "registration_id": registration.id,
                            "event_id": registration.event_id,
                            "table_id": registration.table_id,
                            "status": registration.status,
                        }
                        for registration in registrations_by_person.get(person.id, [])[:DEFAULT_RESULT_LIMIT]
                    ],
                }
                for match, person in ranked[:DEFAULT_RESULT_LIMIT]
            ],
            "count": min(len(ranked), DEFAULT_RESULT_LIMIT),
            "has_more": len(persons) > DEFAULT_RESULT_LIMIT,
        }


async def get_guest_registration(
    session_factory: Any,
    role: str,
    registration_id: str,
) -> dict:
    async with session_factory() as db:
        result = await db.execute(select(Registration).where(Registration.id == registration_id))
        reg: Registration | None = result.scalar_one_or_none()
        if reg is None:
            return {"registration": None, "message": f"Registration '{registration_id}' not found."}

        person_result = await db.execute(select(Person).where(Person.id == reg.person_id))
        person: Person | None = person_result.scalar_one_or_none()
        if person is None:
            return {"registration": None, "message": "Person not found for this registration."}

        d = registration_base_dict(reg, person, role=role)
        d["pre_orders"] = [order_item_dict(item) for item in (reg.pre_orders or [])]
        return {"registration": d}


async def get_table_seating(
    session_factory: Any,
    table_id: str | None = None,
) -> dict:
    async with session_factory() as db:
        if table_id:
            tables_result = await db.execute(select(Table).where(Table.id == table_id))
            tables: list[Table] = list(tables_result.scalars().all())
            if not tables:
                return {"tables": [], "message": f"Table '{table_id}' not found."}
        else:
            edition = await get_active_edition_obj(db)
            if edition is None:
                return {"tables": [], "message": "No active edition found."}

            layouts_result = await db.execute(select(Layout).where(Layout.edition_id == edition.id))
            layout_ids = [lay.id for lay in layouts_result.scalars().all()]
            if not layout_ids:
                return {"tables": [], "edition_id": edition.id}

            tables_result2 = await db.execute(select(Table).where(Table.layout_id.in_(layout_ids)).order_by(Table.name))
            tables = list(tables_result2.scalars().all())

        if not tables:
            return {"tables": []}

        table_ids = [t.id for t in tables]
        regs_result = await db.execute(select(Registration).where(Registration.table_id.in_(table_ids)))
        regs: list[Registration] = list(regs_result.scalars().all())

        person_ids = list({reg.person_id for reg in regs})
        persons: dict[str, Person] = {}
        if person_ids:
            persons_result = await db.execute(select(Person).where(Person.id.in_(person_ids)))
            persons = {p.id: p for p in persons_result.scalars().all()}

        table_reg_map: dict[str, list[Registration]] = {}
        for reg in regs:
            if reg.table_id:
                table_reg_map.setdefault(reg.table_id, []).append(reg)

        result_tables = []
        for table in tables:
            table_regs = table_reg_map.get(table.id, [])
            guests = []
            for reg in table_regs:
                person = persons.get(reg.person_id)
                if person is None:
                    continue
                guests.append(
                    {
                        "registration_id": reg.id,
                        "name": person.name,
                        "guest_count": reg.guest_count,
                        "checked_in": reg.checked_in,
                        "checked_in_at": reg.checked_in_at.isoformat() if reg.checked_in_at else None,
                        "strap_issued": reg.strap_issued,
                        "status": reg.status,
                        "event_id": reg.event_id,
                    }
                )
            result_tables.append(
                {
                    "table_id": table.id,
                    "table_name": table.name,
                    "capacity": table.capacity,
                    "layout_id": table.layout_id,
                    "guests": guests,
                    "guest_count": sum(g["guest_count"] for g in guests),
                    "checked_in_count": sum(1 for g in guests if g["checked_in"]),
                }
            )

        return {"tables": result_tables, "count": len(result_tables)}


async def resolve_table_reference(session_factory: Any, reference: str) -> dict:
    reference = reference.strip()
    if not reference:
        raise ValueError("Provide a table reference to resolve.")

    async with session_factory() as db:
        tables_result = await db.execute(select(Table).order_by(Table.name))
        ranked = [
            (match, table)
            for table in tables_result.scalars().all()
            if (match := rank_table_reference(reference, table_id=table.id, table_name=table.name)) is not None
        ]
        ranked.sort(key=lambda item: (item[0], item[1].name, item[1].id))
        candidates = [
            {
                "table_id": table.id,
                "table_name": table.name,
                "layout_id": table.layout_id,
                "capacity": table.capacity,
                "match": {"kind": match.kind},
            }
            for match, table in ranked[:DEFAULT_RESULT_LIMIT]
        ]
        return {
            "tables": candidates,
            "count": len(candidates),
            "has_more": len(ranked) > DEFAULT_RESULT_LIMIT,
        }
