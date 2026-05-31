"""FastMCP v3 read-only MCP server for Champagne Festival event operations.

Exposes operational tools for answering:
- Who sits where?
- What did a guest or table order?
- Which orders/champagne are already delivered?
- Which tables still have undelivered champagne?
- How many guests are checked in?

Auth tiers (sourced from bearer JWT ``realm_access.roles``):
- ``admin``     – full operational detail, all tools available.
- ``volunteer`` – event-day details: seating, orders, check-in, no sensitive PII.
- ``public``    – no PII; only edition/event/venue overview tools.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.dependencies import get_access_token
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import settings
from app.models import Edition, Event, Layout, Person, Registration, Table, Venue

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Role constants
# ---------------------------------------------------------------------------

ROLE_ADMIN = "admin"
ROLE_VOLUNTEER = "volunteer"
ROLE_PUBLIC = "public"


# ---------------------------------------------------------------------------
# Backend wrapper
# ---------------------------------------------------------------------------


class ChampagneFestivalMcpBackend:
    """Orchestrates DB queries and shapes payloads for MCP tools.

    Parameters
    ----------
    session_factory:
        An ``async_sessionmaker`` that produces ``AsyncSession`` instances.
    """

    def __init__(self, session_factory: async_sessionmaker) -> None:
        self.session_factory = session_factory

    # ------------------------------------------------------------------
    # Role resolution
    # ------------------------------------------------------------------

    def _resolve_role(self) -> str:
        """Resolve the caller's role from the FastMCP access token.

        Returns ``'admin'``, ``'volunteer'``, or ``'public'``.
        """
        token = get_access_token()
        if token is None:
            return ROLE_PUBLIC
        claims: dict[str, Any] = getattr(token, "claims", {})
        realm_access = claims.get("realm_access")
        roles: list[str] = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
        if not isinstance(roles, list):
            roles = []
        if ROLE_ADMIN in roles:
            return ROLE_ADMIN
        if ROLE_VOLUNTEER in roles:
            return ROLE_VOLUNTEER
        return ROLE_PUBLIC

    def _require_volunteer(self) -> str:
        """Raise ``PermissionError`` for unauthenticated callers.

        Returns the resolved role (``'admin'`` or ``'volunteer'``).
        """
        role = self._resolve_role()
        if role == ROLE_PUBLIC:
            raise PermissionError("Authentication required: this tool is only available to volunteers and admins.")
        return role

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_active_edition_obj(self, db: Any) -> Edition | None:
        """Return the current or next upcoming active edition, or ``None``."""
        from sqlalchemy.orm import selectinload

        result = await db.execute(select(Edition).options(selectinload(Edition.events)).where(Edition.active.is_(True)))
        editions: list[Edition] = list(result.scalars().all())
        if not editions:
            return None
        today = datetime.now(UTC).date()

        def _end_date(edition: Edition):
            return max((ev.date for ev in edition.events), default=None)

        upcoming = [
            e
            for e in editions
            if _end_date(e) is not None and _end_date(e) >= today  # type: ignore[operator]
        ]
        if not upcoming:
            return None
        # Return soonest upcoming edition
        return min(upcoming, key=lambda e: _end_date(e) or today)

    @staticmethod
    def _edition_dict(edition: Edition) -> dict:
        events = sorted(edition.events, key=lambda ev: (ev.date, ev.start_time))
        return {
            "id": edition.id,
            "year": edition.year,
            "month": edition.month,
            "edition_type": edition.edition_type,
            "active": edition.active,
            "event_count": len(events),
            "dates": sorted({str(ev.date) for ev in events}),
            "venue_id": edition.venue_id,
        }

    @staticmethod
    def _event_dict(event: Event) -> dict:
        return {
            "id": event.id,
            "edition_id": event.edition_id,
            "title": event.title,
            "description": event.description,
            "date": str(event.date),
            "start_time": event.start_time,
            "end_time": event.end_time,
            "category": event.category,
            "registration_required": event.registration_required,
            "max_capacity": event.max_capacity,
            "active": event.active,
        }

    @staticmethod
    def _person_dict(person: Person, *, role: str) -> dict:
        """Return person fields allowed for ``role``."""
        base: dict = {
            "id": person.id,
            "name": person.name,
        }
        if role in (ROLE_VOLUNTEER, ROLE_ADMIN):
            base["email"] = person.email
            base["phone"] = person.phone
        if role == ROLE_ADMIN:
            base["address"] = person.address
            base["club_name"] = person.club_name
            base["roles"] = person.roles
            base["notes"] = person.notes
        return base

    @staticmethod
    def _order_item_dict(item: Any) -> dict:
        if not isinstance(item, dict):
            item = {}
        try:
            quantity = int(item.get("quantity", 0))
        except (TypeError, ValueError):
            quantity = 0
        quantity = max(quantity, 0)

        delivered_flag = bool(item.get("delivered", False))
        delivered_quantity_raw = item.get("delivered_quantity")
        if delivered_quantity_raw is None:
            delivered_quantity = quantity if delivered_flag else 0
        else:
            try:
                delivered_quantity = int(delivered_quantity_raw)
            except (TypeError, ValueError):
                delivered_quantity = 0
        delivered_quantity = max(0, min(delivered_quantity, quantity))
        remaining_quantity = quantity - delivered_quantity

        return {
            "product_id": item.get("product_id", ""),
            "name": item.get("name", ""),
            "category": item.get("category", ""),
            "quantity": quantity,
            "price": item.get("price", 0.0),
            "delivered_quantity": delivered_quantity,
            "remaining_quantity": remaining_quantity,
            "delivered": remaining_quantity == 0,
        }

    @staticmethod
    def _registration_base_dict(reg: Registration, person: Person, *, role: str) -> dict:
        return {
            "id": reg.id,
            "event_id": reg.event_id,
            "person": ChampagneFestivalMcpBackend._person_dict(person, role=role),
            "guest_count": reg.guest_count,
            "table_id": reg.table_id,
            "status": reg.status,
            "payment_status": reg.payment_status,
            "checked_in": reg.checked_in,
            "checked_in_at": reg.checked_in_at.isoformat() if reg.checked_in_at else None,
            "strap_issued": reg.strap_issued,
            "accessibility_note": reg.accessibility_note,
        }

    # ------------------------------------------------------------------
    # Tools — public (no auth)
    # ------------------------------------------------------------------

    async def get_active_edition(self) -> dict:
        """Return the current or next upcoming active festival edition.

        Returns a summary of the active edition including edition ID, year, month,
        type, event count, and scheduled dates. No PII is included.

        Returns an empty dict when no active or upcoming edition is found.
        """
        async with self.session_factory() as db:
            edition = await self._get_active_edition_obj(db)
            if edition is None:
                return {"active_edition": None, "message": "No active or upcoming editions found."}
            return {"active_edition": self._edition_dict(edition)}

    async def get_event_schedule(self, edition_id: str | None = None) -> dict:
        """Return the event schedule for an edition.

        Parameters
        ----------
        edition_id:
            The edition ID to fetch. When omitted, the active edition is used.

        Returns a list of events with date, times, title, and category.
        No PII is included.
        """
        from sqlalchemy.orm import selectinload

        async with self.session_factory() as db:
            if edition_id:
                result = await db.execute(
                    select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
                )
                edition: Edition | None = result.scalar_one_or_none()
                if edition is None:
                    return {"events": [], "message": f"Edition '{edition_id}' not found."}
            else:
                edition = await self._get_active_edition_obj(db)
                if edition is None:
                    return {"events": [], "message": "No active edition found."}

            events = sorted(edition.events, key=lambda ev: (ev.date, ev.start_time))
            return {
                "edition_id": edition.id,
                "events": [self._event_dict(ev) for ev in events],
            }

    async def get_venue_plan_summary(self, edition_id: str | None = None) -> dict:
        """Return a high-level overview of the venue plan for an edition.

        Lists rooms and total table counts. No PII is included.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active edition is used.
        """
        from sqlalchemy.orm import selectinload

        async with self.session_factory() as db:
            if edition_id:
                result = await db.execute(
                    select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
                )
                edition: Edition | None = result.scalar_one_or_none()
                if edition is None:
                    return {"rooms": [], "message": f"Edition '{edition_id}' not found."}
            else:
                edition = await self._get_active_edition_obj(db)
                if edition is None:
                    return {"rooms": [], "message": "No active edition found."}

            # Load venue
            venue_result = await db.execute(select(Venue).where(Venue.id == edition.venue_id))
            venue: Venue | None = venue_result.scalar_one_or_none()

            # Load layouts for this edition
            layouts_result = await db.execute(
                select(Layout).options(selectinload(Layout.room)).where(Layout.edition_id == edition.id)
            )
            layouts: list[Layout] = list(layouts_result.scalars().all())

            # For each layout count tables
            table_counts: dict[str, int] = {}
            if layouts:
                layout_ids = [lay.id for lay in layouts]
                counts_result = await db.execute(
                    select(Table.layout_id, func.count(Table.id))
                    .where(Table.layout_id.in_(layout_ids))
                    .group_by(Table.layout_id)
                )
                table_counts = {row[0]: row[1] for row in counts_result.all()}

            rooms_seen: set[str] = set()
            room_summaries: list[dict] = []
            for layout in layouts:
                room = layout.room
                if room.id in rooms_seen:
                    continue
                rooms_seen.add(room.id)
                room_summaries.append(
                    {
                        "room_id": room.id,
                        "room_name": room.name,
                        "layout_id": layout.id,
                        "day_id": layout.day_id,
                        "table_count": table_counts.get(layout.id, 0),
                    }
                )

            return {
                "edition_id": edition.id,
                "venue_id": edition.venue_id,
                "venue_name": venue.name if venue else None,
                "rooms": room_summaries,
                "total_tables": sum(table_counts.values()),
            }

    # ------------------------------------------------------------------
    # Tools — volunteer/admin only
    # ------------------------------------------------------------------

    async def find_guest(
        self,
        name: str | None = None,
        email: str | None = None,
    ) -> dict:
        """Search for guests by name and/or email.

        At least one of ``name`` or ``email`` must be provided.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        name:
            Partial, case-insensitive name match.
        email:
            Exact (case-insensitive) email match.

        Returns a list of matching persons with contact info (role-dependent).
        """
        role = self._require_volunteer()

        if not name and not email:
            return {"guests": [], "message": "Provide at least one of 'name' or 'email' to search."}

        async with self.session_factory() as db:
            stmt = select(Person)
            filters = []
            if name:
                filters.append(Person.name.ilike(f"%{name}%"))
            if email:
                filters.append(Person.email == email.lower().strip())

            stmt = stmt.where(or_(*filters)).order_by(Person.name).limit(50)
            result = await db.execute(stmt)
            persons: list[Person] = list(result.scalars().all())

            return {
                "guests": [self._person_dict(p, role=role) for p in persons],
                "count": len(persons),
            }

    async def get_guest_registration(self, registration_id: str) -> dict:
        """Return full registration details for a specific registration ID.

        Includes guest info, event, table assignment, check-in status, and pre-orders.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        registration_id:
            The registration ID (e.g. ``reg_1234567890_abcdef12``).
        """
        role = self._require_volunteer()

        async with self.session_factory() as db:
            result = await db.execute(select(Registration).where(Registration.id == registration_id))
            reg: Registration | None = result.scalar_one_or_none()
            if reg is None:
                return {"registration": None, "message": f"Registration '{registration_id}' not found."}

            person_result = await db.execute(select(Person).where(Person.id == reg.person_id))
            person: Person | None = person_result.scalar_one_or_none()
            if person is None:
                return {"registration": None, "message": "Person not found for this registration."}

            d = self._registration_base_dict(reg, person, role=role)
            d["pre_orders"] = [self._order_item_dict(item) for item in (reg.pre_orders or [])]
            return {"registration": d}

    async def get_table_seating(self, table_id: str | None = None) -> dict:
        """Return seating information for a table, or all tables for the active edition.

        Shows which guests are assigned to each table and their check-in status.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        table_id:
            Specific table ID. When omitted, all tables for the active edition are returned.
        """
        self._require_volunteer()

        from sqlalchemy.orm import selectinload  # noqa: F401 — selectinload may be used by edition query

        async with self.session_factory() as db:
            if table_id:
                tables_result = await db.execute(select(Table).where(Table.id == table_id))
                tables: list[Table] = list(tables_result.scalars().all())
                if not tables:
                    return {"tables": [], "message": f"Table '{table_id}' not found."}
            else:
                # Get all tables for the active edition via its layouts
                edition = await self._get_active_edition_obj(db)
                if edition is None:
                    return {"tables": [], "message": "No active edition found."}

                layouts_result = await db.execute(select(Layout).where(Layout.edition_id == edition.id))
                layout_ids = [lay.id for lay in layouts_result.scalars().all()]
                if not layout_ids:
                    return {"tables": [], "edition_id": edition.id}

                tables_result2 = await db.execute(
                    select(Table).where(Table.layout_id.in_(layout_ids)).order_by(Table.name)
                )
                tables = list(tables_result2.scalars().all())

            if not tables:
                return {"tables": []}

            # Load registrations for these tables
            table_ids = [t.id for t in tables]
            regs_result = await db.execute(select(Registration).where(Registration.table_id.in_(table_ids)))
            regs: list[Registration] = list(regs_result.scalars().all())

            # Load persons for these registrations
            person_ids = list({reg.person_id for reg in regs})
            persons: dict[str, Person] = {}
            if person_ids:
                persons_result = await db.execute(select(Person).where(Person.id.in_(person_ids)))
                persons = {p.id: p for p in persons_result.scalars().all()}

            # Build table → registrations map
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

    async def get_table_order_summary(self, table_id: str) -> dict:
        """Return the order summary for all registrations at a specific table.

        Lists each registration's order items (champagne, food, other) with
        ordered/delivered/remaining quantities per line.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        table_id:
            The table ID to query orders for.
        """
        role = self._require_volunteer()

        async with self.session_factory() as db:
            # Verify table exists
            table_result = await db.execute(select(Table).where(Table.id == table_id))
            table: Table | None = table_result.scalar_one_or_none()
            if table is None:
                return {"table_id": table_id, "registrations": [], "message": f"Table '{table_id}' not found."}

            # Load registrations at this table
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
                orders = [self._order_item_dict(item) for item in (reg.pre_orders or [])]
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

    async def get_guest_order_status(self, registration_id: str) -> dict:
        """Return the order status for a specific registration.

        Shows each order line (champagne, food, other) with ordered, delivered,
        and remaining quantities.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        registration_id:
            The registration ID.
        """
        self._require_volunteer()

        async with self.session_factory() as db:
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

            orders = [self._order_item_dict(item) for item in (reg.pre_orders or [])]
            champagne_orders = [o for o in orders if o["category"] == "champagne"]
            delivered = [o for o in champagne_orders if o["delivered"]]
            pending = [o for o in champagne_orders if not o["delivered"]]
            champagne_quantity_ordered = sum(o["quantity"] for o in champagne_orders)
            champagne_quantity_delivered = sum(o["delivered_quantity"] for o in champagne_orders)
            champagne_quantity_pending = sum(o["remaining_quantity"] for o in champagne_orders)

            return {
                "registration_id": reg.id,
                "person_name": person.name if person else None,
                "table_id": reg.table_id,
                "checked_in": reg.checked_in,
                "orders": orders,
                "champagne_lines_total": len(champagne_orders),
                "champagne_lines_delivered": len(delivered),
                "champagne_lines_pending": len(pending),
                "champagne_quantity_ordered": champagne_quantity_ordered,
                "champagne_quantity_delivered": champagne_quantity_delivered,
                "champagne_quantity_pending": champagne_quantity_pending,
            }

    async def get_champagne_delivery_summary(self, edition_id: str | None = None) -> dict:
        """Return a champagne delivery summary across all registrations for an edition.

        Aggregates delivery state by product and reports exact ordered,
        delivered, and remaining bottle counts.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active edition is used.
        """
        self._require_volunteer()

        from sqlalchemy.orm import selectinload

        async with self.session_factory() as db:
            if edition_id:
                edition_result = await db.execute(
                    select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
                )
                edition: Edition | None = edition_result.scalar_one_or_none()
                if edition is None:
                    return {"edition_id": edition_id, "products": [], "message": f"Edition '{edition_id}' not found."}
            else:
                edition = await self._get_active_edition_obj(db)
                if edition is None:
                    return {"edition_id": None, "products": [], "message": "No active edition found."}

            # Get all event IDs for this edition
            event_ids = [ev.id for ev in edition.events]
            if not event_ids:
                return {"edition_id": edition.id, "products": [], "message": "No events found in this edition."}

            regs_result = await db.execute(select(Registration).where(Registration.event_id.in_(event_ids)))
            regs: list[Registration] = list(regs_result.scalars().all())

            # Aggregate champagne order items by product
            product_stats: dict[str, dict] = {}
            for reg in regs:
                for item in reg.pre_orders or []:
                    normalized_item = self._order_item_dict(item)
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

    async def get_undelivered_champagne_by_table(self, edition_id: str | None = None) -> dict:
        """Return tables that have at least one undelivered champagne order.

        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active edition is used.
        """
        self._require_volunteer()

        from sqlalchemy.orm import selectinload

        async with self.session_factory() as db:
            if edition_id:
                edition_result = await db.execute(
                    select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
                )
                edition: Edition | None = edition_result.scalar_one_or_none()
                if edition is None:
                    return {"tables": [], "message": f"Edition '{edition_id}' not found."}
            else:
                edition = await self._get_active_edition_obj(db)
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

            # Find registrations with at least one undelivered champagne item
            pending_table_map: dict[str, dict] = {}
            for reg in regs:
                if not reg.table_id:
                    continue
                pending_items = []
                for item in reg.pre_orders or []:
                    normalized_item = self._order_item_dict(item)
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

            # Load table names
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

    async def get_check_in_summary(self, edition_id: str | None = None) -> dict:
        """Return check-in statistics for an edition.

        Reports total registrations, checked-in count, not-yet-checked-in count,
        total guest count, and strap issued count.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active edition is used.
        """
        self._require_volunteer()

        from sqlalchemy.orm import selectinload

        async with self.session_factory() as db:
            if edition_id:
                edition_result = await db.execute(
                    select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
                )
                edition: Edition | None = edition_result.scalar_one_or_none()
                if edition is None:
                    return {"message": f"Edition '{edition_id}' not found."}
            else:
                edition = await self._get_active_edition_obj(db)
                if edition is None:
                    return {"message": "No active edition found."}

            event_ids = [ev.id for ev in edition.events]
            if not event_ids:
                return {
                    "edition_id": edition.id,
                    "total_registrations": 0,
                    "checked_in": 0,
                    "not_checked_in": 0,
                    "total_guests": 0,
                    "straps_issued": 0,
                }

            regs_result = await db.execute(select(Registration).where(Registration.event_id.in_(event_ids)))
            regs: list[Registration] = list(regs_result.scalars().all())

            total = len(regs)
            checked_in = sum(1 for r in regs if r.checked_in)
            total_guests = sum(r.guest_count for r in regs)
            straps = sum(1 for r in regs if r.strap_issued)

            return {
                "edition_id": edition.id,
                "total_registrations": total,
                "checked_in": checked_in,
                "not_checked_in": total - checked_in,
                "total_guests": total_guests,
                "straps_issued": straps,
            }


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_mcp_server(
    session_factory: async_sessionmaker | None = None,
    auth: Any = None,
) -> FastMCP:
    """Create and return a configured :class:`FastMCP` server.

    Parameters
    ----------
    session_factory:
        An ``async_sessionmaker`` to use for database access.
        Defaults to the application's shared ``async_session_factory``.
    auth:
        An optional FastMCP ``AuthProvider`` (e.g. ``KeycloakAuthProvider``).
        When ``None``, the server runs without authentication enforcement;
        all tools will resolve to the ``'public'`` role unless a bearer
        token is provided via another mechanism.
    """
    if session_factory is None:
        from app.database import async_session_factory as _default_factory

        session_factory = _default_factory

    backend = ChampagneFestivalMcpBackend(session_factory)

    mcp = FastMCP(
        name="Champagne Festival",
        instructions=(
            "Read-only operational tools for Champagne Festival event staff. "
            "Tools cover seating, orders, champagne delivery, and check-in status. "
            "Most tools require the 'volunteer' or 'admin' role."
        ),
        auth=auth,
    )

    # Register all tools
    mcp.tool(backend.get_active_edition)
    mcp.tool(backend.get_event_schedule)
    mcp.tool(backend.get_venue_plan_summary)
    mcp.tool(backend.find_guest)
    mcp.tool(backend.get_guest_registration)
    mcp.tool(backend.get_table_seating)
    mcp.tool(backend.get_table_order_summary)
    mcp.tool(backend.get_guest_order_status)
    mcp.tool(backend.get_champagne_delivery_summary)
    mcp.tool(backend.get_undelivered_champagne_by_table)
    mcp.tool(backend.get_check_in_summary)

    return mcp


# ---------------------------------------------------------------------------
# Keycloak auth helper
# ---------------------------------------------------------------------------


def build_keycloak_auth() -> Any:
    """Build a :class:`KeycloakAuthProvider` from application settings.

    Requires ``OIDC_ISSUER_URL`` and ``MCP_BASE_URL`` to be set.
    Returns ``None`` when OIDC is not configured (development / stdio mode).
    """
    if not settings.oidc_issuer_url:
        logger.info("OIDC_ISSUER_URL not configured — MCP server running without auth enforcement.")
        return None

    mcp_base_url = settings.mcp_base_url
    if not mcp_base_url:
        logger.info(
            "MCP_BASE_URL not configured — MCP server running without Keycloak auth. "
            "Set MCP_BASE_URL to enable OIDC authentication."
        )
        return None

    try:
        from fastmcp.server.auth.providers.keycloak import KeycloakAuthProvider

        return KeycloakAuthProvider(
            realm_url=settings.oidc_issuer_url,
            base_url=mcp_base_url,
            audience=settings.oidc_audience or None,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to build Keycloak auth provider: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Stdio entry point
# ---------------------------------------------------------------------------


def _run_stdio() -> None:  # pragma: no cover
    """Run the MCP server in stdio transport mode for local desktop agents."""
    import asyncio

    mcp = create_mcp_server(auth=None)
    asyncio.run(mcp.run_async(transport="stdio"))


if __name__ == "__main__":  # pragma: no cover
    _run_stdio()
