"""Public tools: no authentication needed.

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from app.core.translations import Language
from app.mcp import public as mcp_public
from app.mcp.tools.base import McpBackendBase


class PublicTools(McpBackendBase):
    """Public tools: no authentication needed."""

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

    async def get_event_schedule(self, edition_id: str | None = None, locale: Language | None = None) -> dict:
        """Return the event schedule for an edition.

        Parameters
        ----------
        edition_id:
            The edition ID to fetch. When omitted, the active festival edition is used —
            pass an explicit ``edition_id`` (see ``list_editions``) to target a Bourse or
            capsule-exchange edition instead.
        locale:
            ``nl``, ``fr`` or ``en``. ``title`` and ``description`` are resolved for this
            language and fall back to Dutch; omit it for Dutch. Every stored language is also returned (``title_nl`` and so on).

        Returns a list of events with date, times, title, and category.
        No PII is included.
        """
        return await mcp_public.get_event_schedule(self.session_factory, edition_id, locale)

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

    async def find_stand(self, query: str | None = None, edition_id: str | None = None) -> dict:
        """Find where an organization stands ("where is Bollinger?").

        Parameters
        ----------
        query:
            Case-insensitive part of the organization name. Omit to list every
            organization that has a stand.
        edition_id:
            The edition ID. When omitted, the active festival edition is used.

        Returns, per organization (producer, sponsor, vendor, ...), its stands as
        ``{event_id, date, room_name, label}`` (an organization can stand somewhere
        else on a different day). Organizations without an assigned stand are not
        listed, and nothing is returned before the festival starts or more than a
        week after it ends. Public data only: no tables, guests or capacities.
        """
        return await mcp_public.find_stand(self.session_factory, query, edition_id)
