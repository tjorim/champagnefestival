"""FastMCP v4 MCP server for Champagnefestival event operations.

Exposes operational tools for answering:
- Who sits where?
- What did a guest or table order?
- Which orders/champagne are already delivered?
- Which tables still have undelivered champagne?
- How many guests are checked in?

...and, for admins, full write/management parity with the admin REST API:
editions, events, venues, rooms, table types, tables, layouts, areas, FAQ,
settings, exhibitors, people, members, volunteers, registrations, and
read access to the audit trail. See ``app.mcp.admin`` for the write tool
implementations — every mutation goes through the same ``write_audit_entry``
path the REST admin routes use, so the audit log is complete regardless of
which surface made the change.

Auth tiers (sourced from bearer JWT ``realm_access.roles``):
- ``admin``     – full operational detail and all write tools.
- ``volunteer`` – event-day details: seating, orders, check-in, no sensitive PII.
- ``public``    – no PII; only edition/event/venue overview tools.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import date as dt_date
from datetime import datetime
from typing import Any, Literal

from fastmcp import FastMCP
from fastmcp.server.dependencies import get_access_token
from fastmcp.server.transforms.search import BM25SearchTransform
from fastmcp.tools.base import Tool
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.mcp import check_in as mcp_check_in
from app.mcp import delivery as mcp_delivery
from app.mcp import orders as mcp_orders
from app.mcp import public as mcp_public
from app.mcp import seating as mcp_seating
from app.mcp.admin import areas as mcp_admin_areas
from app.mcp.admin import audit as mcp_admin_audit
from app.mcp.admin import editions as mcp_admin_editions
from app.mcp.admin import events as mcp_admin_events
from app.mcp.admin import exhibitors as mcp_admin_exhibitors
from app.mcp.admin import faq as mcp_admin_faq
from app.mcp.admin import integration_clients as mcp_admin_integration_clients
from app.mcp.admin import layouts as mcp_admin_layouts
from app.mcp.admin import members as mcp_admin_members
from app.mcp.admin import people as mcp_admin_people
from app.mcp.admin import registrations as mcp_admin_registrations
from app.mcp.admin import rooms as mcp_admin_rooms
from app.mcp.admin import settings as mcp_admin_settings
from app.mcp.admin import table_types as mcp_admin_table_types
from app.mcp.admin import tables as mcp_admin_tables
from app.mcp.admin import venues as mcp_admin_venues
from app.mcp.admin import volunteers as mcp_admin_volunteers
from app.mcp.auth import build_keycloak_auth as build_keycloak_auth
from app.mcp.capabilities import (
    ROLE_ADMIN,
    ROLE_PUBLIC,
    ROLE_VOLUNTEER,
    tool_annotations,
    tool_auth,
)
from app.schemas import EditionType
from app.services.integration_clients_service import DEFAULT_RATE_LIMIT_PER_MINUTE
from app.version import APP_VERSION

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Backend wrapper
# ---------------------------------------------------------------------------


def _search_serializer(
    tools: Sequence[Tool],
) -> list[dict[str, Any]]:
    """Custom serializer for BM25SearchTransform that adds role metadata.

    Adds required_role and effect to each tool in search results so clients
    can see authorization requirements without calling each tool.
    """
    from app.mcp.capabilities import tool_effect, tool_required_role

    return [
        {
            "name": tool.name,
            "description": tool.description or "",
            "input_schema": tool.parameters,
            "required_role": tool_required_role(tool.name),
            "effect": tool_effect(tool.name),
        }
        for tool in tools
    ]


class ChampagneFestivalMcpBackend:
    """Thin assembler: resolves auth and delegates to domain modules.

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

    def _require_admin(self) -> str:
        """Raise ``PermissionError`` unless the caller has the ``admin`` role.

        Mirrors ``require_admin`` on the equivalent REST endpoints — every
        write tool is admin-only. Returns ``'admin'`` for symmetry with
        ``_require_volunteer``.
        """
        role = self._resolve_role()
        if role != ROLE_ADMIN:
            raise PermissionError("Authentication required: this tool is only available to admins.")
        return role

    def _actor(self) -> str:
        """Return the OIDC ``sub`` claim for audit logging, or ``'anonymous'``.

        MCP equivalent of ``app.auth.get_actor_id`` — there is no ``request.state``
        to read from, so this reads the ``sub`` claim directly off the access token.
        """
        token = get_access_token()
        if token is None:
            return "anonymous"
        claims: dict[str, Any] = getattr(token, "claims", {})
        sub = claims.get("sub")
        return str(sub) if sub is not None else "anonymous"

    def _auth_source(self) -> str:
        """Return ``'keycloak'``, ``'integration'``, or ``'none'`` for the current caller.

        ``IntegrationKeyTokenVerifier`` stamps ``claims['auth_source'] =
        'integration'`` on tokens it verifies (see ``app.mcp.integration_auth``);
        a Keycloak-issued JWT never carries that claim, so its absence on an
        authenticated token means Keycloak.
        """
        token = get_access_token()
        if token is None:
            return "none"
        claims: dict[str, Any] = getattr(token, "claims", {})
        return "integration" if claims.get("auth_source") == "integration" else "keycloak"

    # ------------------------------------------------------------------
    # Tools — public (no auth)
    # ------------------------------------------------------------------

    async def whoami(self) -> dict:
        """Return the caller's resolved identity: auth source, subject, and effective role.

        No authentication required — an unauthenticated caller gets
        ``{"auth_source": "none", "subject": None, "role": "public"}``. Never
        exposes token material (the bearer token itself, or raw JWT claims).
        """
        auth_source = self._auth_source()
        return {
            "auth_source": auth_source,
            "subject": self._actor() if auth_source != "none" else None,
            "role": self._resolve_role(),
        }

    async def get_active_edition(self) -> dict:
        """Return the current or next upcoming active festival edition.

        Only considers ``festival``-type editions — a nearer Bourse or capsule-exchange
        edition never takes its place. Use ``list_editions`` to discover other edition
        types and pass their ``edition_id`` to type-agnostic tools like ``get_event_schedule``.

        Returns a summary of the active edition including edition ID, year, month,
        type, event count, and scheduled dates. No PII is included.

        Returns an empty dict when no active or upcoming edition is found.
        """
        return await mcp_public.get_active_edition(self.session_factory)

    async def list_editions(self) -> dict:
        """List past and upcoming festival editions for public discovery.

        Returns edition IDs, years, types, date ranges, and active status.
        No PII is included.
        """
        return await mcp_public.list_editions(self.session_factory)

    async def get_event_schedule(self, edition_id: str | None = None) -> dict:
        """Return the event schedule for an edition.

        Parameters
        ----------
        edition_id:
            The edition ID to fetch. When omitted, the active festival edition is used —
            pass an explicit ``edition_id`` (see ``list_editions``) to target a Bourse or
            capsule-exchange edition instead.

        Returns a list of events with date, times, title, and category.
        No PII is included.
        """
        return await mcp_public.get_event_schedule(self.session_factory, edition_id)

    async def get_venue_plan_summary(self, edition_id: str | None = None) -> dict:
        """Return a high-level overview of the venue plan for an edition.

        Lists room names only — no table counts or other capacity/attendance
        numbers, which stay behind the volunteer/admin tier. No PII is included.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active festival edition is used — pass an
            explicit ``edition_id`` (see ``list_editions``) to target a Bourse or
            capsule-exchange edition instead.
        """
        return await mcp_public.get_venue_plan_summary(self.session_factory, edition_id)

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

        Shows which guests are assigned to each table and their check-in status.
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

    # ------------------------------------------------------------------
    # Tools — admin write/management (full REST parity, see app.mcp.admin)
    # ------------------------------------------------------------------

    # -- Venues --------------------------------------------------------

    async def create_venue(
        self,
        name: str,
        address: str = "",
        city: str = "",
        postal_code: str = "",
        country: str = "",
        lat: float = 0.0,
        lng: float = 0.0,
        active: bool = True,
    ) -> dict:
        """Create a venue. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_venues.create_venue(
            self.session_factory,
            self._actor(),
            name=name,
            address=address,
            city=city,
            postal_code=postal_code,
            country=country,
            lat=lat,
            lng=lng,
            active=active,
        )

    async def list_venues(self) -> dict:
        """List all venues. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_venues.list_venues(self.session_factory)

    async def get_venue(self, venue_id: str) -> dict:
        """Return a single venue. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_venues.get_venue(self.session_factory, venue_id)

    async def update_venue(
        self,
        venue_id: str,
        name: str | None = None,
        address: str | None = None,
        city: str | None = None,
        postal_code: str | None = None,
        country: str | None = None,
        lat: float | None = None,
        lng: float | None = None,
        active: bool | None = None,
    ) -> dict:
        """Partially update a venue; omitted fields are left unchanged. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_venues.update_venue(
            self.session_factory,
            self._actor(),
            venue_id,
            name=name,
            address=address,
            city=city,
            postal_code=postal_code,
            country=country,
            lat=lat,
            lng=lng,
            active=active,
        )

    async def delete_venue(self, venue_id: str) -> dict:
        """Delete a venue. Fails if editions or rooms still reference it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_venues.delete_venue(self.session_factory, self._actor(), venue_id)

    # -- Rooms -----------------------------------------------------------

    async def create_room(
        self,
        name: str,
        venue_id: str,
        width_m: float,
        length_m: float,
        color: str = "#6c757d",
        active: bool = True,
    ) -> dict:
        """Create a room within a venue. Requires the ``admin`` role.

        ``width_m``/``length_m`` are the room's real measured dimensions in
        metres — there is no defensible generic default, so both are required.
        """
        self._require_admin()
        return await mcp_admin_rooms.create_room(
            self.session_factory,
            self._actor(),
            name=name,
            venue_id=venue_id,
            width_m=width_m,
            length_m=length_m,
            color=color,
            active=active,
        )

    async def list_rooms(self) -> dict:
        """List all rooms. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_rooms.list_rooms(self.session_factory)

    async def get_room(self, room_id: str) -> dict:
        """Return a single room. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_rooms.get_room(self.session_factory, room_id)

    async def update_room(
        self,
        room_id: str,
        venue_id: str | None = None,
        name: str | None = None,
        width_m: float | None = None,
        length_m: float | None = None,
        color: str | None = None,
        active: bool | None = None,
    ) -> dict:
        """Partially update a room; omitted fields are left unchanged. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_rooms.update_room(
            self.session_factory,
            self._actor(),
            room_id,
            venue_id=venue_id,
            name=name,
            width_m=width_m,
            length_m=length_m,
            color=color,
            active=active,
        )

    async def delete_room(self, room_id: str) -> dict:
        """Delete a room. Fails if layouts still reference it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_rooms.delete_room(self.session_factory, self._actor(), room_id)

    # -- Table types -------------------------------------------------------

    async def create_table_type(
        self,
        name: str,
        max_capacity: int,
        width_m: float,
        length_m: float,
        shape: Literal["rectangle", "round"] = "rectangle",
        height_type: Literal["low", "high"] = "low",
        active: bool = True,
    ) -> dict:
        """Create a table type. Requires the ``admin`` role.

        ``width_m``/``length_m`` are the table's real measured dimensions in
        metres — there is no defensible generic default, so both are required.
        For ``shape="round"`` only the diameter matters: pass it as either
        ``width_m`` or ``length_m`` (the larger of the two is used).

        ``height_type`` is ``"low"`` for a standard seated dining table, or
        ``"high"`` for a high-top/cocktail-height standing table.
        """
        self._require_admin()
        return await mcp_admin_table_types.create_table_type(
            self.session_factory,
            self._actor(),
            name=name,
            shape=shape,
            width_m=width_m,
            length_m=length_m,
            height_type=height_type,
            max_capacity=max_capacity,
            active=active,
        )

    async def list_table_types(self) -> dict:
        """List all table types. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_table_types.list_table_types(self.session_factory)

    async def get_table_type(self, type_id: str) -> dict:
        """Return a single table type. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_table_types.get_table_type(self.session_factory, type_id)

    async def update_table_type(
        self,
        type_id: str,
        name: str | None = None,
        shape: Literal["rectangle", "round"] | None = None,
        width_m: float | None = None,
        length_m: float | None = None,
        height_type: Literal["low", "high"] | None = None,
        max_capacity: int | None = None,
        active: bool | None = None,
    ) -> dict:
        """Partially update a table type; omitted fields are left unchanged.

        Changing ``shape`` to ``"round"`` (or updating dimensions) re-normalises
        ``length_m``/``width_m`` the same way the REST endpoint does.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_table_types.update_table_type(
            self.session_factory,
            self._actor(),
            type_id,
            name=name,
            shape=shape,
            width_m=width_m,
            length_m=length_m,
            height_type=height_type,
            max_capacity=max_capacity,
            active=active,
        )

    async def delete_table_type(self, type_id: str) -> dict:
        """Delete a table type. Fails if tables still use it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_table_types.delete_table_type(self.session_factory, self._actor(), type_id)

    # -- Tables ----------------------------------------------------------

    async def create_table(
        self,
        name: str,
        capacity: int,
        table_type_id: str,
        layout_id: str,
        x: float = 50.0,
        y: float = 50.0,
        rotation: int = 0,
    ) -> dict:
        """Create a table on a layout. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_tables.create_table(
            self.session_factory,
            self._actor(),
            name=name,
            capacity=capacity,
            table_type_id=table_type_id,
            layout_id=layout_id,
            x=x,
            y=y,
            rotation=rotation,
        )

    async def list_tables(self) -> dict:
        """List all tables. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_tables.list_tables(self.session_factory)

    async def get_table(self, table_id: str) -> dict:
        """Return a single table, including its current registration ids. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_tables.get_table(self.session_factory, table_id)

    async def update_table(
        self,
        table_id: str,
        name: str | None = None,
        capacity: int | None = None,
        x: float | None = None,
        y: float | None = None,
        table_type_id: str | None = None,
        rotation: int | None = None,
        layout_id: str | None = None,
    ) -> dict:
        """Partially update a table; omitted fields are left unchanged. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_tables.update_table(
            self.session_factory,
            self._actor(),
            table_id,
            name=name,
            capacity=capacity,
            x=x,
            y=y,
            table_type_id=table_type_id,
            rotation=rotation,
            layout_id=layout_id,
        )

    async def delete_table(self, table_id: str) -> dict:
        """Delete a table. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_tables.delete_table(self.session_factory, self._actor(), table_id)

    # -- Layouts -----------------------------------------------------------

    async def create_layout(
        self,
        room_id: str,
        edition_id: str | None = None,
        day_id: int | None = None,
        date: dt_date | None = None,
        label: str = "",
    ) -> dict:
        """Create a floor-plan layout for a room. Either ``day_id`` or ``date`` is required.

        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_layouts.create_layout(
            self.session_factory,
            self._actor(),
            room_id=room_id,
            edition_id=edition_id,
            day_id=day_id,
            date=date,
            label=label,
        )

    async def copy_layout(
        self,
        source_layout_id: str,
        room_id: str,
        edition_id: str | None = None,
        day_id: int | None = None,
        date: dt_date | None = None,
        label: str = "",
        copy_tables: bool = True,
        copy_areas: bool = True,
    ) -> dict:
        """Copy a layout's tables/areas onto a new room+day. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_layouts.copy_layout(
            self.session_factory,
            self._actor(),
            source_layout_id,
            room_id=room_id,
            edition_id=edition_id,
            day_id=day_id,
            date=date,
            label=label,
            copy_tables=copy_tables,
            copy_areas=copy_areas,
        )

    async def list_layouts(self) -> dict:
        """List all layouts. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_layouts.list_layouts(self.session_factory)

    async def get_layout(self, layout_id: str) -> dict:
        """Return a single layout. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_layouts.get_layout(self.session_factory, layout_id)

    async def delete_layout(self, layout_id: str) -> dict:
        """Delete a layout. Fails if tables still reference it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_layouts.delete_layout(self.session_factory, self._actor(), layout_id)

    # -- Areas -----------------------------------------------------------

    async def create_area(
        self,
        layout_id: str,
        label: str,
        icon: str = "bi-shop",
        exhibitor_id: int | None = None,
        width_m: float = 1.5,
        length_m: float = 1.0,
        x: float = 50.0,
        y: float = 50.0,
        rotation: int = 0,
    ) -> dict:
        """Create a floor-plan area (e.g. an exhibitor booth) on a layout. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_areas.create_area(
            self.session_factory,
            self._actor(),
            layout_id=layout_id,
            label=label,
            icon=icon,
            exhibitor_id=exhibitor_id,
            width_m=width_m,
            length_m=length_m,
            x=x,
            y=y,
            rotation=rotation,
        )

    async def list_areas(self, layout_id: str | None = None) -> dict:
        """List areas, optionally filtered by ``layout_id``. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_areas.list_areas(self.session_factory, layout_id)

    async def get_area(self, area_id: str) -> dict:
        """Return a single area. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_areas.get_area(self.session_factory, area_id)

    async def update_area(
        self,
        area_id: str,
        label: str | None = None,
        icon: str | None = None,
        exhibitor_id: int | None = None,
        clear_exhibitor_id: bool = False,
        width_m: float | None = None,
        length_m: float | None = None,
        x: float | None = None,
        y: float | None = None,
        rotation: int | None = None,
    ) -> dict:
        """Partially update an area; omitted fields are left unchanged.

        ``exhibitor_id`` has no natural "clear" value (a real id is never blank) —
        pass ``clear_exhibitor_id=True`` to unassign the exhibitor instead of
        providing an id. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_areas.update_area(
            self.session_factory,
            self._actor(),
            area_id,
            label=label,
            icon=icon,
            exhibitor_id=exhibitor_id,
            clear_exhibitor_id=clear_exhibitor_id,
            width_m=width_m,
            length_m=length_m,
            x=x,
            y=y,
            rotation=rotation,
        )

    async def delete_area(self, area_id: str) -> dict:
        """Delete an area. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_areas.delete_area(self.session_factory, self._actor(), area_id)

    # -- Editions ----------------------------------------------------------

    async def create_edition(
        self,
        id: str,
        year: int,
        month: str,
        venue_id: str,
        edition_type: EditionType = "festival",
        exhibitors: list[int] | None = None,
        co_organizer_exhibitor_id: int | None = None,
        active: bool = True,
    ) -> dict:
        """Create a festival/bourse/capsule-exchange edition. Requires the ``admin`` role.

        Only festival editions may carry an ``exhibitors`` lineup. See ``list_editions``
        for public discovery of existing edition ids.
        """
        self._require_admin()
        return await mcp_admin_editions.create_edition(
            self.session_factory,
            self._actor(),
            id=id,
            year=year,
            month=month,
            venue_id=venue_id,
            edition_type=edition_type,
            exhibitors=exhibitors,
            co_organizer_exhibitor_id=co_organizer_exhibitor_id,
            active=active,
        )

    async def get_edition(self, edition_id: str) -> dict:
        """Return full admin detail for a single edition (including inactive events). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_editions.get_edition(self.session_factory, edition_id)

    async def update_edition(
        self,
        edition_id: str,
        year: int | None = None,
        month: str | None = None,
        venue_id: str | None = None,
        edition_type: EditionType | None = None,
        exhibitors: list[int] | None = None,
        co_organizer_exhibitor_id: int | None = None,
        clear_co_organizer: bool = False,
        active: bool | None = None,
    ) -> dict:
        """Partially update an edition; omitted fields are left unchanged.

        ``exhibitors=None`` leaves the lineup unchanged — pass an explicit list
        (including an empty one) to replace it. ``co_organizer_exhibitor_id`` has
        no natural "clear" value, so pass ``clear_co_organizer=True`` to unset it.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_editions.update_edition(
            self.session_factory,
            self._actor(),
            edition_id,
            year=year,
            month=month,
            venue_id=venue_id,
            edition_type=edition_type,
            exhibitors=exhibitors,
            co_organizer_exhibitor_id=co_organizer_exhibitor_id,
            clear_co_organizer=clear_co_organizer,
            active=active,
        )

    async def delete_edition(self, edition_id: str) -> dict:
        """Delete an edition. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_editions.delete_edition(self.session_factory, self._actor(), edition_id)

    # -- Events ------------------------------------------------------------

    async def create_event(
        self,
        edition_id: str,
        title: str,
        date: dt_date,
        start_time: str,
        category: str,
        description: str = "",
        end_time: str | None = None,
        registration_required: bool = False,
        registrations_open_from: datetime | None = None,
        max_capacity: int | None = None,
        active: bool = True,
    ) -> dict:
        """Create an event within an edition. Requires the ``admin`` role.

        Off-festival (bourse/capsule-exchange) editions may only contain events on
        a single date. ``registrations_open_from``/``max_capacity`` may only be set
        when ``registration_required`` is true.
        """
        self._require_admin()
        return await mcp_admin_events.create_event(
            self.session_factory,
            self._actor(),
            edition_id=edition_id,
            title=title,
            date=date,
            start_time=start_time,
            category=category,
            description=description,
            end_time=end_time,
            registration_required=registration_required,
            registrations_open_from=registrations_open_from,
            max_capacity=max_capacity,
            active=active,
        )

    async def get_event(self, event_id: str) -> dict:
        """Return full admin detail for a single event. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_events.get_event(self.session_factory, event_id)

    async def update_event(
        self,
        event_id: str,
        edition_id: str | None = None,
        title: str | None = None,
        description: str | None = None,
        date: dt_date | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
        category: str | None = None,
        registration_required: bool | None = None,
        registrations_open_from: datetime | None = None,
        max_capacity: int | None = None,
        active: bool | None = None,
        clear_end_time: bool = False,
        clear_registrations_open_from: bool = False,
        clear_max_capacity: bool = False,
    ) -> dict:
        """Partially update an event; omitted fields are left unchanged.

        ``end_time``/``registrations_open_from``/``max_capacity`` have no natural
        "clear" value, so pass ``clear_end_time=True`` / ``clear_registrations_open_from=True``
        / ``clear_max_capacity=True`` to unset them instead of providing a value.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_events.update_event(
            self.session_factory,
            self._actor(),
            event_id,
            edition_id=edition_id,
            title=title,
            description=description,
            date=date,
            start_time=start_time,
            end_time=end_time,
            category=category,
            registration_required=registration_required,
            registrations_open_from=registrations_open_from,
            max_capacity=max_capacity,
            active=active,
            clear_end_time=clear_end_time,
            clear_registrations_open_from=clear_registrations_open_from,
            clear_max_capacity=clear_max_capacity,
        )

    async def delete_event(self, event_id: str) -> dict:
        """Delete an event. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_events.delete_event(self.session_factory, self._actor(), event_id)

    # -- FAQ -----------------------------------------------------------

    async def create_faq_item(
        self,
        question_nl: str,
        answer_nl: str,
        question_en: str | None = None,
        answer_en: str | None = None,
        question_fr: str | None = None,
        answer_fr: str | None = None,
        sort_order: int = 0,
        active: bool = True,
    ) -> dict:
        """Create an FAQ item. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_faq.create_faq_item(
            self.session_factory,
            self._actor(),
            question_nl=question_nl,
            answer_nl=answer_nl,
            question_en=question_en,
            answer_en=answer_en,
            question_fr=question_fr,
            answer_fr=answer_fr,
            sort_order=sort_order,
            active=active,
        )

    async def list_faq_items(self) -> dict:
        """List every FAQ item and locale, active or not (admin shape). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_faq.list_faq_items(self.session_factory)

    async def update_faq_item(
        self,
        faq_item_id: str,
        question_nl: str | None = None,
        answer_nl: str | None = None,
        question_en: str | None = None,
        answer_en: str | None = None,
        question_fr: str | None = None,
        answer_fr: str | None = None,
        sort_order: int | None = None,
        active: bool | None = None,
    ) -> dict:
        """Partially update an FAQ item; omitted fields are left unchanged.

        For the optional ``en``/``fr`` locale fields, an explicit empty string
        clears that locale's translation (hiding the item on that locale's FAQ)
        rather than leaving it unchanged. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_faq.update_faq_item(
            self.session_factory,
            self._actor(),
            faq_item_id,
            question_nl=question_nl,
            answer_nl=answer_nl,
            question_en=question_en,
            answer_en=answer_en,
            question_fr=question_fr,
            answer_fr=answer_fr,
            sort_order=sort_order,
            active=active,
        )

    async def delete_faq_item(self, faq_item_id: str) -> dict:
        """Delete an FAQ item. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_faq.delete_faq_item(self.session_factory, self._actor(), faq_item_id)

    # -- Settings ------------------------------------------------------

    async def get_settings(self) -> dict:
        """Return site-wide settings (currently just maintenance mode). No authentication required."""
        return await mcp_admin_settings.get_settings(self.session_factory)

    async def set_maintenance_mode(self, maintenance_mode: bool) -> dict:
        """Toggle maintenance mode site-wide. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_settings.set_maintenance_mode(
            self.session_factory, self._actor(), maintenance_mode=maintenance_mode
        )

    # -- Exhibitors ------------------------------------------------------

    async def create_exhibitor(
        self,
        name: str,
        image: str = "",
        website: str = "",
        active: bool = True,
        type: str = "vendor",
        contact_person_id: str | None = None,
    ) -> dict:
        """Create an exhibitor (producer/sponsor/vendor). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_exhibitors.create_exhibitor(
            self.session_factory,
            self._actor(),
            name=name,
            image=image,
            website=website,
            active=active,
            type=type,
            contact_person_id=contact_person_id,
        )

    async def get_exhibitor(self, exhibitor_id: int) -> dict:
        """Return a single exhibitor. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_exhibitors.get_exhibitor(self.session_factory, exhibitor_id)

    async def list_exhibitors(self, exhibitor_type: str | None = None) -> dict:
        """List exhibitors, optionally filtered by ``exhibitor_type``. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_exhibitors.list_exhibitors(self.session_factory, exhibitor_type)

    async def update_exhibitor(
        self,
        exhibitor_id: int,
        name: str | None = None,
        image: str | None = None,
        website: str | None = None,
        active: bool | None = None,
        type: str | None = None,
        contact_person_id: str | None = None,
        clear_contact_person: bool = False,
    ) -> dict:
        """Partially update an exhibitor; omitted fields are left unchanged.

        Retyping to ``"vendor"`` fails while any edition still lists this exhibitor
        (vendors may not appear in an edition lineup). ``contact_person_id`` has no
        natural "clear" value, so pass ``clear_contact_person=True`` to unset it.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_exhibitors.update_exhibitor(
            self.session_factory,
            self._actor(),
            exhibitor_id,
            name=name,
            image=image,
            website=website,
            active=active,
            type=type,
            contact_person_id=contact_person_id,
            clear_contact_person=clear_contact_person,
        )

    async def delete_exhibitor(self, exhibitor_id: int) -> dict:
        """Delete an exhibitor (also removed from any edition lineups). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_exhibitors.delete_exhibitor(self.session_factory, self._actor(), exhibitor_id)

    # -- People ----------------------------------------------------------

    async def create_person(
        self,
        name: str,
        email: str | None = None,
        phone: str = "",
        address: str = "",
        roles: list[str] | None = None,
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        visits_per_month: int | None = None,
        club_name: str = "",
        notes: str = "",
        active: bool = True,
    ) -> dict:
        """Create a person. Requires the ``admin`` role.

        Use ``find_guest`` (volunteer/admin) to search existing people by name/email.
        """
        self._require_admin()
        return await mcp_admin_people.create_person(
            self.session_factory,
            self._actor(),
            name=name,
            email=email,
            phone=phone,
            address=address,
            roles=roles,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            visits_per_month=visits_per_month,
            club_name=club_name,
            notes=notes,
            active=active,
        )

    async def get_person(self, person_id: str) -> dict:
        """Return full admin detail for a single person. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_people.get_person(self.session_factory, person_id)

    async def update_person(
        self,
        person_id: str,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        address: str | None = None,
        roles: list[str] | None = None,
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        visits_per_month: int | None = None,
        club_name: str | None = None,
        notes: str | None = None,
        active: bool | None = None,
    ) -> dict:
        """Partially update a person; omitted fields are left unchanged.

        An explicit empty string clears ``national_register_number``/``eid_document_number``.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_people.update_person(
            self.session_factory,
            self._actor(),
            person_id,
            name=name,
            email=email,
            phone=phone,
            address=address,
            roles=roles,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            visits_per_month=visits_per_month,
            club_name=club_name,
            notes=notes,
            active=active,
        )

    async def delete_person(self, person_id: str) -> dict:
        """Delete a person and their registrations. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_people.delete_person(self.session_factory, self._actor(), person_id)

    async def merge_people(self, person_id: str, duplicate_id: str) -> dict:
        """Merge ``duplicate_id`` into ``person_id``, re-pointing registrations/exhibitor
        contacts/volunteer periods and deleting the duplicate. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_people.merge_people(self.session_factory, self._actor(), person_id, duplicate_id)

    # -- Members -----------------------------------------------------------

    async def create_member(
        self,
        name: str,
        email: str | None = None,
        phone: str = "",
        address: str = "",
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        visits_per_month: int | None = None,
        club_name: str = "",
        notes: str = "",
        active: bool = True,
        roles: list[str] | None = None,
    ) -> dict:
        """Create a member (a ``Person`` with the ``member`` role, always added automatically).

        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_members.create_member(
            self.session_factory,
            self._actor(),
            name=name,
            email=email,
            phone=phone,
            address=address,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            visits_per_month=visits_per_month,
            club_name=club_name,
            notes=notes,
            active=active,
            roles=roles,
        )

    async def get_member(self, person_id: str) -> dict:
        """Return a single member. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_members.get_member(self.session_factory, person_id)

    async def list_members(self, q: str | None = None, active: bool | None = None) -> dict:
        """Search/list members. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_members.list_members(self.session_factory, q, active)

    async def update_member(
        self,
        person_id: str,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        address: str | None = None,
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        visits_per_month: int | None = None,
        club_name: str | None = None,
        notes: str | None = None,
        active: bool | None = None,
        roles: list[str] | None = None,
    ) -> dict:
        """Partially update a member; omitted fields are left unchanged. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_members.update_member(
            self.session_factory,
            self._actor(),
            person_id,
            name=name,
            email=email,
            phone=phone,
            address=address,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            visits_per_month=visits_per_month,
            club_name=club_name,
            notes=notes,
            active=active,
            roles=roles,
        )

    async def delete_member(self, person_id: str) -> dict:
        """Delete a member and their registrations. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_members.delete_member(self.session_factory, self._actor(), person_id)

    # -- Volunteers ----------------------------------------------------

    async def create_volunteer(
        self,
        name: str,
        national_register_number: str,
        eid_document_number: str,
        help_periods: list[dict],
        address: str = "",
        active: bool = True,
    ) -> dict:
        """Create a volunteer (a ``Person`` with the ``volunteer`` role).

        ``help_periods`` is a list of ``{"first_help_day": "YYYY-MM-DD", "last_help_day":
        "YYYY-MM-DD" | None}`` and must contain at least one entry. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_volunteers.create_volunteer(
            self.session_factory,
            self._actor(),
            name=name,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            address=address,
            active=active,
            help_periods=help_periods,
        )

    async def get_volunteer(self, volunteer_id: str) -> dict:
        """Return a single volunteer, including help periods. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_volunteers.get_volunteer(self.session_factory, volunteer_id)

    async def list_volunteers(self, q: str | None = None, active: bool | None = None) -> dict:
        """Search/list volunteers, including help periods. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_volunteers.list_volunteers(self.session_factory, q, active)

    async def update_volunteer(
        self,
        volunteer_id: str,
        name: str | None = None,
        address: str | None = None,
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        active: bool | None = None,
        help_periods: list[dict] | None = None,
    ) -> dict:
        """Partially update a volunteer; omitted fields are left unchanged.

        Passing ``help_periods`` replaces the full set of help periods. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_volunteers.update_volunteer(
            self.session_factory,
            self._actor(),
            volunteer_id,
            name=name,
            address=address,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            active=active,
            help_periods=help_periods,
        )

    async def delete_volunteer(self, volunteer_id: str) -> dict:
        """Remove the volunteer role and help periods (the person record is kept). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_volunteers.delete_volunteer(self.session_factory, self._actor(), volunteer_id)

    # -- Registrations (admin) ------------------------------------------

    async def create_registration(
        self,
        person_id: str,
        event_id: str,
        guest_count: int,
        order_items: list[dict] | None = None,
        notes: str = "",
        accessibility_note: str = "",
        status: str = "confirmed",
    ) -> dict:
        """Create a registration on a guest's behalf. Requires the ``admin`` role.

        ``order_items`` is a list of ``{"product_id": ..., "quantity": ...}``; quantities
        are resolved against the event's real active products server-side.
        """
        self._require_admin()
        return await mcp_admin_registrations.create_registration(
            self.session_factory,
            self._actor(),
            person_id=person_id,
            event_id=event_id,
            guest_count=guest_count,
            order_items=order_items,
            notes=notes,
            accessibility_note=accessibility_note,
            status=status,
        )

    async def update_registration(
        self,
        registration_id: str,
        status: str | None = None,
        payment_status: str | None = None,
        amount_due: float | None = None,
        clear_amount_due: bool = False,
        table_id: str | None = None,
        clear_table: bool = False,
        order_items: list[dict] | None = None,
        notes: str | None = None,
        accessibility_note: str | None = None,
        person_id: str | None = None,
        checked_in: bool | None = None,
        strap_issued: bool | None = None,
    ) -> dict:
        """Partially update a registration; omitted fields are left unchanged.

        ``amount_due``/``table_id`` have no natural "clear" value via a plain optional
        parameter (0.0 is a valid amount_due) — pass ``clear_amount_due=True`` /
        ``clear_table=True`` to null them out. ``order_items`` takes full order lines
        (``product_id``, ``name``, ``quantity``, ``price``, ``category``,
        ``delivered_quantity``, ...), which is how delivery/order edits are made.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_registrations.update_registration(
            self.session_factory,
            self._actor(),
            registration_id,
            status=status,
            payment_status=payment_status,
            amount_due=amount_due,
            clear_amount_due=clear_amount_due,
            table_id=table_id,
            clear_table=clear_table,
            order_items=order_items,
            notes=notes,
            accessibility_note=accessibility_note,
            person_id=person_id,
            checked_in=checked_in,
            strap_issued=strap_issued,
        )

    async def delete_registration(self, registration_id: str) -> dict:
        """Delete a registration. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_registrations.delete_registration(self.session_factory, self._actor(), registration_id)

    # -- Audit trail (read) ----------------------------------------------

    async def list_audit_entries(
        self,
        resource_type: str | None = None,
        resource_id: str | None = None,
        actor: str | None = None,
        action: str | None = None,
        since: str | None = None,
        until: str | None = None,
        limit: int | None = None,
        offset: int = 0,
        before_id: str | None = None,
    ) -> dict:
        """List audit entries (newest first), with optional filters. Requires the ``admin`` role.

        ``since``/``until`` are ISO-8601 timestamps. ``limit`` defaults to 100 and is
        capped at 1000 — the audit table only grows, so it is never unbounded.
        """
        self._require_admin()
        return await mcp_admin_audit.list_audit_entries(
            self.session_factory,
            resource_type=resource_type,
            resource_id=resource_id,
            actor=actor,
            action=action,
            since=since,
            until=until,
            limit=limit,
            offset=offset,
            before_id=before_id,
        )

    async def list_audit_resource_types(self) -> dict:
        """Return the distinct ``resource_type`` values seen in the audit trail so far.

        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_audit.list_audit_resource_types(self.session_factory)

    # -- Integration clients (managed automation credentials) ------------

    async def create_integration_client(
        self,
        name: str,
        allowed_role: str,
        rate_limit_per_minute: int = DEFAULT_RATE_LIMIT_PER_MINUTE,
    ) -> dict:
        """Create a managed integration-client credential for MCP automation.

        Returns the new client's details plus its raw key — shown exactly
        once here, never recoverable afterward (only its hash is stored).
        ``allowed_role`` must be ``"admin"`` or ``"volunteer"``; a credential
        can never be created more privileged than the caller's own tier.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_integration_clients.create_integration_client(
            self.session_factory,
            self._actor(),
            name=name,
            allowed_role=allowed_role,
            rate_limit_per_minute=rate_limit_per_minute,
        )

    async def list_integration_clients(self) -> dict:
        """List all managed integration clients (never includes key material). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_integration_clients.list_integration_clients(self.session_factory)

    async def revoke_integration_client(self, client_id: str) -> dict:
        """Revoke (disable) a managed integration client. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_integration_clients.revoke_integration_client(
            self.session_factory, self._actor(), client_id
        )

    async def rotate_integration_client(self, client_id: str) -> dict:
        """Replace an active integration client's credential with a freshly generated one.

        Returns the client's details plus the new raw key (shown exactly once).
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_integration_clients.rotate_integration_client(
            self.session_factory, self._actor(), client_id
        )


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
        name="Champagnefestival",
        instructions=(
            "Operational tools for Champagnefestival event staff. Read-only tools cover "
            "seating, orders, champagne delivery, and check-in status; most require the "
            "'volunteer' or 'admin' role. Admins additionally get full write/management "
            "parity with the admin REST API: editions, events, venues, rooms, table types, "
            "tables, layouts, areas, FAQ, settings, exhibitors, people, members, volunteers, "
            "registrations, and the audit trail. Use search_tools for natural language "
            "tool discovery."
        ),
        auth=auth,
        version=APP_VERSION,
        # Every admin tool's business errors are raised as `MCPToolError`
        # (app.mcp.utils), which FastMCP re-raises verbatim regardless of this
        # setting. Masking here is the safety net for exceptions nobody wrapped
        # that way — e.g. a raw driver `IntegrityError` — which would otherwise
        # have their full str() (SQL, row contents) embedded in the tool result.
        mask_error_details=True,
        transforms=[
            BM25SearchTransform(
                max_results=10,
                always_visible=["whoami"],
                search_tool_name="search_tools",
                call_tool_name="call_tool",
                search_result_serializer=_search_serializer,
            )
        ],
    )

    def register_tool(fn: Any) -> None:
        mcp.tool(
            fn,
            annotations=tool_annotations(fn.__name__),
            auth=tool_auth(fn.__name__),
        )

    # Register all tools with explicit safety metadata for MCP clients.
    register_tool(backend.whoami)
    register_tool(backend.get_active_edition)
    register_tool(backend.list_editions)
    register_tool(backend.get_event_schedule)
    register_tool(backend.get_venue_plan_summary)
    register_tool(backend.find_guest)
    register_tool(backend.get_guest_registration)
    register_tool(backend.get_table_seating)
    register_tool(backend.resolve_table_reference)
    register_tool(backend.get_table_order_summary)
    register_tool(backend.get_guest_order_status)
    register_tool(backend.get_champagne_delivery_summary)
    register_tool(backend.get_undelivered_champagne_by_table)
    register_tool(backend.get_check_in_summary)

    # Register all admin write/management tools (see app.mcp.admin)
    register_tool(backend.create_venue)
    register_tool(backend.list_venues)
    register_tool(backend.get_venue)
    register_tool(backend.update_venue)
    register_tool(backend.delete_venue)
    register_tool(backend.create_room)
    register_tool(backend.list_rooms)
    register_tool(backend.get_room)
    register_tool(backend.update_room)
    register_tool(backend.delete_room)
    register_tool(backend.create_table_type)
    register_tool(backend.list_table_types)
    register_tool(backend.get_table_type)
    register_tool(backend.update_table_type)
    register_tool(backend.delete_table_type)
    register_tool(backend.create_table)
    register_tool(backend.list_tables)
    register_tool(backend.get_table)
    register_tool(backend.update_table)
    register_tool(backend.delete_table)
    register_tool(backend.create_layout)
    register_tool(backend.copy_layout)
    register_tool(backend.list_layouts)
    register_tool(backend.get_layout)
    register_tool(backend.delete_layout)
    register_tool(backend.create_area)
    register_tool(backend.list_areas)
    register_tool(backend.get_area)
    register_tool(backend.update_area)
    register_tool(backend.delete_area)
    register_tool(backend.create_edition)
    register_tool(backend.get_edition)
    register_tool(backend.update_edition)
    register_tool(backend.delete_edition)
    register_tool(backend.create_event)
    register_tool(backend.get_event)
    register_tool(backend.update_event)
    register_tool(backend.delete_event)
    register_tool(backend.create_faq_item)
    register_tool(backend.list_faq_items)
    register_tool(backend.update_faq_item)
    register_tool(backend.delete_faq_item)
    register_tool(backend.get_settings)
    register_tool(backend.set_maintenance_mode)
    register_tool(backend.create_exhibitor)
    register_tool(backend.get_exhibitor)
    register_tool(backend.list_exhibitors)
    register_tool(backend.update_exhibitor)
    register_tool(backend.delete_exhibitor)
    register_tool(backend.create_person)
    register_tool(backend.get_person)
    register_tool(backend.update_person)
    register_tool(backend.delete_person)
    register_tool(backend.merge_people)
    register_tool(backend.create_member)
    register_tool(backend.get_member)
    register_tool(backend.list_members)
    register_tool(backend.update_member)
    register_tool(backend.delete_member)
    register_tool(backend.create_volunteer)
    register_tool(backend.get_volunteer)
    register_tool(backend.list_volunteers)
    register_tool(backend.update_volunteer)
    register_tool(backend.delete_volunteer)
    register_tool(backend.create_registration)
    register_tool(backend.update_registration)
    register_tool(backend.delete_registration)
    register_tool(backend.list_audit_entries)
    register_tool(backend.list_audit_resource_types)
    register_tool(backend.create_integration_client)
    register_tool(backend.list_integration_clients)
    register_tool(backend.revoke_integration_client)
    register_tool(backend.rotate_integration_client)

    return mcp


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
