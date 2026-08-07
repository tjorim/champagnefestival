"""Public (no-auth) MCP tool implementations for editions, events, and venue."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import select

from app.mcp.utils import edition_dict, edition_discovery_dict, event_dict, get_active_edition_obj
from app.models import Edition, Layout, Venue


async def get_active_edition(session_factory: Any) -> dict:
    """Return the current or next upcoming active festival edition."""
    async with session_factory() as db:
        edition = await get_active_edition_obj(db)
        if edition is None:
            return {"active_edition": None, "message": "No active or upcoming editions found."}
        return {"active_edition": edition_dict(edition)}


async def list_editions(session_factory: Any) -> dict:
    """List past and upcoming festival editions for public discovery."""
    from sqlalchemy.orm import selectinload

    async with session_factory() as db:
        result = await db.execute(select(Edition).options(selectinload(Edition.events)))
        editions: list[Edition] = list(result.scalars().all())

    editions_with_dates = [(edition, sorted({event.date for event in edition.events})) for edition in editions]

    def _sort_key(item: tuple[Edition, list[date]]) -> tuple[date, date, int, str]:
        edition, dates = item
        return (
            dates[0] if dates else date.max,
            dates[-1] if dates else date.max,
            edition.year,
            edition.id,
        )

    editions_with_dates.sort(key=_sort_key)
    return {
        "editions": [edition_discovery_dict(edition, dates) for edition, dates in editions_with_dates],
        "count": len(editions),
    }


async def get_event_schedule(session_factory: Any, edition_id: str | None = None) -> dict:
    """Return the event schedule for an edition."""
    from sqlalchemy.orm import selectinload

    async with session_factory() as db:
        if edition_id:
            result = await db.execute(
                select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
            )
            edition: Edition | None = result.scalar_one_or_none()
            if edition is None:
                return {"events": [], "message": f"Edition '{edition_id}' not found."}
        else:
            edition = await get_active_edition_obj(db)
            if edition is None:
                return {"events": [], "message": "No active edition found."}

        events = sorted(edition.events, key=lambda ev: (ev.date, ev.start_time))
        return {
            "edition_id": edition.id,
            "events": [event_dict(ev) for ev in events],
        }


async def get_venue_plan_summary(session_factory: Any, edition_id: str | None = None) -> dict:
    """Return a high-level overview of the venue plan for an edition.

    Room names only — no table counts or any other capacity/attendance
    numbers, which stay behind the volunteer/admin tier (see
    ``get_table_seating`` and the full ``/api/venue-plan/{edition_id}``
    REST endpoint for the detailed floor layout).
    """
    from sqlalchemy.orm import selectinload

    async with session_factory() as db:
        if edition_id:
            result = await db.execute(
                select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
            )
            edition: Edition | None = result.scalar_one_or_none()
            if edition is None:
                return {"rooms": [], "message": f"Edition '{edition_id}' not found."}
        else:
            edition = await get_active_edition_obj(db)
            if edition is None:
                return {"rooms": [], "message": "No active edition found."}

        venue_result = await db.execute(select(Venue).where(Venue.id == edition.venue_id))
        venue: Venue | None = venue_result.scalar_one_or_none()

        layouts_result = await db.execute(
            select(Layout).options(selectinload(Layout.room)).where(Layout.edition_id == edition.id)
        )
        layouts: list[Layout] = list(layouts_result.scalars().all())

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
                }
            )

        return {
            "edition_id": edition.id,
            "venue_id": edition.venue_id,
            "venue_name": venue.name if venue else None,
            "rooms": room_summaries,
        }
