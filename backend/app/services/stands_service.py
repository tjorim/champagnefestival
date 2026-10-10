"""Public producer-stand lookup (#1223).

An organization's stand is an ``Area`` carrying its ``organization_id`` on a
``Layout`` (event + room). This module exposes the *public subset* of that data:
for each organization in the edition's lineup, the area label, room name and
day of every stand. It never loads tables, registrations or allocations, so
none of that can reach the unauthenticated response.

Stands are published as soon as they are assigned (no publish flag): the data
is limited to what a visitor needs on the day, and organizers reposition stands
in the layout editor, which is reflected after the response cache window.

Shared by ``app.routers.editions`` (REST) and ``app.mcp.public`` (MCP).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Edition, Layout, Organization


async def load_edition_stands(db: AsyncSession, edition: Edition) -> dict:
    """Return ``{"edition_id", "organizations"}`` for the lineup's stands.

    Only active events, active organizations that are in ``edition.organizations``
    and areas that name such an organization are included. Organizations without
    a stand are omitted. Stands are ordered by day, then room, then label;
    organizations by name.
    """
    lineup_ids = set(edition.organizations)
    if not lineup_ids:
        return {"edition_id": edition.id, "organizations": []}

    organizations = {
        organization.id: organization
        for organization in (
            await db.execute(select(Organization).where(Organization.id.in_(lineup_ids), Organization.active.is_(True)))
        )
        .scalars()
        .all()
    }
    if not organizations:
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
