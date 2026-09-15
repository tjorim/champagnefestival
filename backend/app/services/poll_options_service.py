"""Shared application-service operations for volunteer meal/dinner poll options.

Used by both ``app.routers.poll_options`` (REST) and ``app.mcp.admin.poll_options``
(MCP), following the same convention as ``app.services.products_service``.
Raises ``HTTPException`` directly; the MCP adapter translates it into
``MCPToolError`` at its own boundary (``app.mcp.utils.as_value_error``).
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import EditionPollOption, VolunteerPollSelection
from app.schemas import PollOptionCreate, PollOptionUpdate
from app.services.events_service import ensure_edition_exists
from app.utils import get_or_404, make_id


async def get_poll_option_or_404(db: AsyncSession, option_id: str) -> EditionPollOption:
    return await get_or_404(db, EditionPollOption, option_id, "Poll option not found.")


async def list_poll_options(db: AsyncSession, edition_id: str | None = None) -> list[EditionPollOption]:
    stmt = select(EditionPollOption).order_by(EditionPollOption.kind, EditionPollOption.created_at)
    if edition_id is not None:
        stmt = stmt.where(EditionPollOption.edition_id == edition_id)
    return list((await db.execute(stmt)).scalars().all())


async def create_poll_option(
    db: AsyncSession, body: PollOptionCreate, *, actor: str, request_id: str | None = None
) -> EditionPollOption:
    await ensure_edition_exists(db, body.edition_id)
    option = EditionPollOption(
        id=make_id("poll"),
        edition_id=body.edition_id,
        kind=body.kind,
        label=body.label,
    )
    db.add(option)
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_option_created",
        resource_type="edition_poll_option",
        resource_id=option.id,
        request_id=request_id,
        details={"edition_id": option.edition_id, "kind": option.kind, "label": option.label},
    )
    await db.commit()
    await db.refresh(option)
    return option


async def update_poll_option(
    db: AsyncSession, option_id: str, body: PollOptionUpdate, *, actor: str, request_id: str | None = None
) -> EditionPollOption:
    option = await get_poll_option_or_404(db, option_id)
    option.label = body.label
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_option_updated",
        resource_type="edition_poll_option",
        resource_id=option.id,
        request_id=request_id,
        details={"label": option.label},
    )
    await db.commit()
    await db.refresh(option)
    return option


async def delete_poll_option(db: AsyncSession, option_id: str, *, actor: str, request_id: str | None = None) -> None:
    option = await get_poll_option_or_404(db, option_id)
    # ON DELETE CASCADE on volunteer_poll_selections.option_id would do this
    # anyway; deleting explicitly keeps the audit trail's ordering obvious.
    await db.execute(delete(VolunteerPollSelection).where(VolunteerPollSelection.option_id == option_id))
    await db.delete(option)
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_option_deleted",
        resource_type="edition_poll_option",
        resource_id=option_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
