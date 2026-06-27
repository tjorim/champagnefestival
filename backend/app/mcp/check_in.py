"""Check-in domain MCP tool implementations."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.mcp.utils import get_active_edition_obj
from app.models import Edition, Registration


async def get_check_in_summary(session_factory: Any, edition_id: str | None = None) -> dict:
    from sqlalchemy.orm import selectinload

    async with session_factory() as db:
        if edition_id:
            edition_result = await db.execute(
                select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id)
            )
            edition: Edition | None = edition_result.scalar_one_or_none()
            if edition is None:
                return {"message": f"Edition '{edition_id}' not found."}
        else:
            edition = await get_active_edition_obj(db)
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
