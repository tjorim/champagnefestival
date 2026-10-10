"""Public stand lookup (#1223).

An organization's stand is an ``Area`` carrying its ``organization_id`` on a
``Layout`` (event + room). Any organization type (producer, sponsor, vendor, ...)
can have one, whether or not it is in the edition's lineup. This module exposes
the *public subset* of that data: for each active organization with a stand in
the edition's floor plans, the area label, room name and day of every stand. It never loads tables, registrations or allocations, so
none of that can reach the unauthenticated response.

Stands are only published while the festival is on: from the first active
event day through ``STANDS_VISIBLE_DAYS_AFTER`` days after the last one
(Europe/Brussels dates). Before that organizers may still be moving people
around, and afterwards the information is stale. Outside the window the list is
empty. Inside it stands appear as soon as they are assigned (no publish flag);
layout-editor moves show after the response cache window.

Shared by ``app.routers.editions`` (REST) and ``app.mcp.public`` (MCP).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Edition, Event, Layout, Organization

#: Days after the last festival day during which stands stay visible.
STANDS_VISIBLE_DAYS_AFTER = 7

_BRUSSELS = ZoneInfo("Europe/Brussels")


def _today() -> date:
    return datetime.now(UTC).astimezone(_BRUSSELS).date()


def stands_window_is_open(event_days: list[date], today: date | None = None) -> bool:
    """True from the first event day through the grace period after the last."""
    if not event_days:
        return False
    today = today or _today()
    return min(event_days) <= today <= max(event_days) + timedelta(days=STANDS_VISIBLE_DAYS_AFTER)


async def load_edition_stands(db: AsyncSession, edition: Edition) -> dict:
    """Return ``{"edition_id", "organizations"}`` for the edition's stands.

    Empty outside the publication window (see module docstring). Only areas of
    active events that name an active organization are included; organizations
    without a stand are omitted. Stands are ordered by day, then room, then
    label; organizations by name.
    """
    event_days = list(
        (await db.execute(select(Event.date).where(Event.edition_id == edition.id, Event.active.is_(True))))
        .scalars()
        .all()
    )
    if not stands_window_is_open(event_days):
        return {"edition_id": edition.id, "organizations": []}

    layouts = (
        (
            await db.execute(
                select(Layout)
                .options(selectinload(Layout.room), selectinload(Layout.areas))
                .where(Layout.edition_id == edition.id)
            )
        )
        .scalars()
        .all()
    )
    stand_organization_ids = {
        area.organization_id
        for layout in layouts
        if layout.event.active
        for area in layout.areas
        if area.organization_id is not None
    }
    if not stand_organization_ids:
        return {"edition_id": edition.id, "organizations": []}
    organizations = {
        organization.id: organization
        for organization in (
            await db.execute(
                select(Organization).where(Organization.id.in_(stand_organization_ids), Organization.active.is_(True))
            )
        )
        .scalars()
        .all()
    }

    stands_by_organization: dict[int, list[dict]] = {}
    for layout in layouts:
        if not layout.event.active:
            continue
        for area in layout.areas:
            if area.organization_id not in organizations or not area.label.strip():
                continue
            stands_by_organization.setdefault(area.organization_id, []).append(
                {
                    "event_id": layout.event_id,
                    "date": layout.event.date,
                    "room_name": layout.room.name,
                    "label": area.label,
                }
            )

    result: list[dict] = []
    for organization_id, stands in stands_by_organization.items():
        stands.sort(key=lambda stand: (stand["date"], stand["room_name"], stand["label"]))
        result.append(
            {"organization_id": organization_id, "name": organizations[organization_id].name, "stands": stands}
        )
    result.sort(key=lambda item: (str(item["name"]).casefold(), item["organization_id"]))
    return {"edition_id": edition.id, "organizations": result}
