"""Event-day tools: seating, orders, champagne delivery and check-in status (volunteer or admin).

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from app.mcp import check_in as mcp_check_in
from app.mcp import delivery as mcp_delivery
from app.mcp import orders as mcp_orders
from app.mcp import seating as mcp_seating
from app.mcp.tools.base import McpBackendBase


class EventDayTools(McpBackendBase):
    """Event-day tools: seating, orders, champagne delivery and check-in status (volunteer or admin)."""

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
        return await mcp_seating.find_guest(self.session_factory, role, name, email)

    async def get_guest_registration(self, registration_id: str) -> dict:
        """Return full registration details for a specific registration ID.

        Includes guest info, event, table assignment, check-in status, and order items.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        registration_id:
            The registration ID (e.g. ``reg_1234567890_abcdef12``).
        """
        role = self._require_volunteer()
        return await mcp_seating.get_guest_registration(self.session_factory, role, registration_id)

    async def get_table_seating(self, table_id: str | None = None) -> dict:
        """Return seating information for a table, or all tables for the active edition.

        Answers "who is seated at table N" and "who sits where": shows which guests are
        assigned to each table and their check-in status.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        table_id:
            Specific table ID. When omitted, all tables for the active festival edition
            are returned.
        """
        self._require_volunteer()
        return await mcp_seating.get_table_seating(self.session_factory, table_id)

    async def resolve_table_reference(self, reference: str) -> dict:
        """Resolve a visible table number, name, or label to internal table IDs.

        Matching is deterministic: nearby numeric values are never treated as
        typo suggestions. Requires the ``volunteer`` or ``admin`` role.
        """
        self._require_volunteer()
        return await mcp_seating.resolve_table_reference(self.session_factory, reference)

    async def get_table_order_summary(
        self,
        table_id: str | None = None,
        table_reference: str | None = None,
    ) -> dict:
        """Return the order summary for all registrations at a specific table.

        Lists each registration's order items (champagne, food, other) with
        ordered/delivered/remaining quantities per line.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        table_id:
            The internal table ID to query orders for.
        table_reference:
            A visible table number, name, or label. Used only when ``table_id``
            is omitted. Ambiguous references return candidates for selection.
        """
        role = self._require_volunteer()
        return await mcp_orders.get_table_order_summary(self.session_factory, role, table_id, table_reference)

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
        return await mcp_orders.get_guest_order_status(self.session_factory, registration_id)

    async def get_champagne_delivery_summary(self, edition_id: str | None = None) -> dict:
        """Return a champagne delivery summary across all registrations for an edition.

        Aggregates delivery state by product and reports exact ordered,
        delivered, and remaining bottle counts.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active festival edition is used.
        """
        self._require_volunteer()
        return await mcp_delivery.get_champagne_delivery_summary(self.session_factory, edition_id)

    async def get_undelivered_champagne_by_table(self, edition_id: str | None = None) -> dict:
        """Return tables that have at least one undelivered champagne order.

        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active festival edition is used.
        """
        self._require_volunteer()
        return await mcp_delivery.get_undelivered_champagne_by_table(self.session_factory, edition_id)

    async def get_check_in_summary(self, edition_id: str | None = None) -> dict:
        """Return check-in statistics for an edition.

        Reports total registrations, checked-in count, not-yet-checked-in count,
        total guest count, and strap issued count.
        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active festival edition is used.
        """
        self._require_volunteer()
        return await mcp_check_in.get_check_in_summary(self.session_factory, edition_id)
