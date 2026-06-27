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
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.dependencies import get_access_token
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import settings
from app.mcp import check_in as mcp_check_in
from app.mcp import delivery as mcp_delivery
from app.mcp import orders as mcp_orders
from app.mcp import public as mcp_public
from app.mcp import seating as mcp_seating
from app.mcp.utils import ROLE_ADMIN, ROLE_PUBLIC, ROLE_VOLUNTEER, person_dict

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Backend wrapper
# ---------------------------------------------------------------------------


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

    @staticmethod
    def _person_dict(person: Any, *, role: str) -> dict:
        return person_dict(person, role=role)

    # ------------------------------------------------------------------
    # Tools — public (no auth)
    # ------------------------------------------------------------------

    async def get_active_edition(self) -> dict:
        """Return the current or next upcoming active festival edition.

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
            The edition ID to fetch. When omitted, the active edition is used.

        Returns a list of events with date, times, title, and category.
        No PII is included.
        """
        return await mcp_public.get_event_schedule(self.session_factory, edition_id)

    async def get_venue_plan_summary(self, edition_id: str | None = None) -> dict:
        """Return a high-level overview of the venue plan for an edition.

        Lists rooms and total table counts. No PII is included.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active edition is used.
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

        Includes guest info, event, table assignment, check-in status, and pre-orders.
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
            Specific table ID. When omitted, all tables for the active edition are returned.
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
            The edition ID. When omitted, the active edition is used.
        """
        self._require_volunteer()
        return await mcp_delivery.get_champagne_delivery_summary(self.session_factory, edition_id)

    async def get_undelivered_champagne_by_table(self, edition_id: str | None = None) -> dict:
        """Return tables that have at least one undelivered champagne order.

        Requires the ``volunteer`` or ``admin`` role.

        Parameters
        ----------
        edition_id:
            The edition ID. When omitted, the active edition is used.
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
            The edition ID. When omitted, the active edition is used.
        """
        self._require_volunteer()
        return await mcp_check_in.get_check_in_summary(self.session_factory, edition_id)


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
    mcp.tool(backend.list_editions)
    mcp.tool(backend.get_event_schedule)
    mcp.tool(backend.get_venue_plan_summary)
    mcp.tool(backend.find_guest)
    mcp.tool(backend.get_guest_registration)
    mcp.tool(backend.get_table_seating)
    mcp.tool(backend.resolve_table_reference)
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
            required_scopes=["openid", "offline_access"],
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
