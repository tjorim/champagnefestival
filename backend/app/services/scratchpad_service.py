"""Shared application-service operations for the admin scratchpad.

A single shared free-text notepad for general planning notes — not tied to
any volunteer, period, or edition. Browser-only (no MCP/Android/Pebble
equivalent), matching ``app.routers.contact``/``app.routers.waitlist``. Uses
the same lazy-row-creation race handling as ``app.services.settings_service``
since both are fixed-id singleton rows.
"""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import AdminScratchpad
from app.schemas import AdminScratchpadUpdate
from app.utils import admin_scratchpad_to_dict

_SCRATCHPAD_ID = "admin_scratchpad"


async def get_or_create_scratchpad(db: AsyncSession) -> AdminScratchpad:
    scratchpad = await db.get(AdminScratchpad, _SCRATCHPAD_ID)
    if scratchpad is not None:
        return scratchpad

    # Same concurrent-first-request race as settings_service.get_or_create_settings:
    # the insert runs inside a SAVEPOINT so losing the race only unwinds this
    # one insert, not any other work already queued on `db`.
    scratchpad = AdminScratchpad(id=_SCRATCHPAD_ID)
    try:
        async with db.begin_nested():
            db.add(scratchpad)
            await db.flush()
    except IntegrityError as exc:
        constraint = getattr(getattr(exc.orig, "__cause__", None), "constraint_name", None)
        if constraint != "admin_scratchpad_pkey":
            raise
        scratchpad = await db.get(AdminScratchpad, _SCRATCHPAD_ID)
        if scratchpad is None:
            raise RuntimeError("Admin scratchpad row could not be created or reloaded.") from None
    return scratchpad


async def get_scratchpad(db: AsyncSession) -> dict:
    scratchpad = await get_or_create_scratchpad(db)
    await db.commit()  # persist a freshly-created default row; a no-op otherwise
    return admin_scratchpad_to_dict(scratchpad)


async def update_scratchpad(
    db: AsyncSession, *, actor: str, body: AdminScratchpadUpdate, request_id: str | None = None
) -> dict:
    scratchpad = await get_or_create_scratchpad(db)
    scratchpad.content = body.content
    await write_audit_entry(
        db,
        actor=actor,
        action="scratchpad_updated",
        resource_type="admin_scratchpad",
        resource_id=_SCRATCHPAD_ID,
        request_id=request_id,
        details={},
    )
    await db.commit()
    await db.refresh(scratchpad)
    return admin_scratchpad_to_dict(scratchpad)
